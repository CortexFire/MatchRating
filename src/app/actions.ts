"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type AppPlayer } from "@/lib/app-data";
import {
  ensureDemoFixtures,
  getDemoPlayerByEmail,
  getDemoPostLoginPath,
  isDemoLoginEnabled,
} from "@/lib/demo-auth";
import { createInviteToken, hashInviteToken } from "@/lib/invites/tokens";
import {
  type HistoricalMatch,
  rebuildGroupRatingsFromMatches,
  type RatingEvent,
  type RatingState,
} from "@/lib/ratings/glicko2";
import {
  validateMatchSubmission,
  type MatchSubmissionInput,
  type ValidatedMatchSubmission,
} from "@/lib/matches/validation";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
  requireUserId,
} from "@/lib/supabase/server";

export type ActionResult<T = unknown> =
  | { ok: true; data: T; message?: string }
  | { ok: false; message: string };

const groupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(280).optional().default(""),
});

const guestPlayersSchema = z.object({
  groupId: z.string().min(1),
  names: z.array(z.string().trim().min(1).max(80)).min(1).max(4),
});

const onboardingProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
});

const claimGuestProfilesSchema = z.object({
  groupId: z.string().min(1),
  guestProfileIds: z.array(z.string().min(1)).min(1).max(12),
});

const disputeSchema = z.object({
  revisionId: z.string().uuid(),
  note: z.string().trim().min(2).max(600),
});

const emailOtpSchema = z.object({
  email: z.string().email(),
  token: z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    .refine((value) => /^\d{6}$/.test(value), {
      message: "Enter the 6-digit code from your email.",
    }),
});

const reviseSchema = z
  .object({
    matchId: z.string().uuid(),
    reason: z.string().trim().min(2).max(600),
  })
  .and(
    z.object({
      groupId: z.string().uuid(),
      format: z.enum(["singles", "doubles"]),
      teamAUserIds: z.array(z.string().uuid()),
      teamBUserIds: z.array(z.string().uuid()),
      games: z.array(
        z.object({
          teamAScore: z.number().int().min(0).max(99),
          teamBScore: z.number().int().min(0).max(99),
        }),
      ),
    }),
  );

const DEFAULT_AUTH_REDIRECT_PATH = "/onboarding";

function getSiteOrigin() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

function getSafeAuthNextPath(value = DEFAULT_AUTH_REDIRECT_PATH) {
  if (!value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_AUTH_REDIRECT_PATH;
  }

  return value;
}

function getAuthCallbackUrl(nextPath = DEFAULT_AUTH_REDIRECT_PATH) {
  return `${getSiteOrigin()}/auth/confirm?next=${encodeURIComponent(getSafeAuthNextPath(nextPath))}`;
}

function getActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? fallback;
  }

  return error instanceof Error ? error.message : fallback;
}

function normalizeGuestName(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).join(" ");
}

function splitGuestName(name: string) {
  const [firstName = "", ...rest] = normalizeGuestName(name).split(" ");
  return { firstName, lastName: rest.join(" ") };
}

function initialsFor(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

async function ensureActiveMember(groupId: string, userId: string, service = createSupabaseServiceClient()) {
  const { data, error } = await service
    .from("group_memberships")
    .select("id, role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .eq("status", "active")
    .is("left_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("You are not an active member of this group.");
  }

  return data as { id: string; role: "owner" | "admin" | "member" };
}

async function getActiveMemberIds(groupId: string) {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("group_memberships")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("status", "active")
    .is("left_at", null);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row: { user_id: string }) => row.user_id);
}
type SupabaseService = ReturnType<typeof createSupabaseServiceClient>;

type InviteRow = {
  id: string;
  group_id: string;
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  revoked_at: string | null;
};

async function getInviteByToken(token: string, service: SupabaseService): Promise<InviteRow> {
  const tokenHash = hashInviteToken(token);
  const { data: invite, error } = await service
    .from("group_invites")
    .select("id, group_id, expires_at, max_uses, use_count, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!invite || invite.revoked_at) {
    throw new Error("This invite link is no longer valid.");
  }

  if (invite.expires_at && Date.parse(invite.expires_at) < Date.now()) {
    throw new Error("This invite link has expired.");
  }

  if (invite.max_uses && invite.use_count >= invite.max_uses) {
    throw new Error("This invite link has already been used.");
  }

  return invite as InviteRow;
}

function formatLastActive(value?: string | null) {
  if (!value) {
    return "No matches yet";
  }

  const days = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 86_400_000));
  if (days === 0) {
    return "Last active today";
  }

  return `Last active ${days} ${days === 1 ? "day" : "days"} ago`;
}

async function getClaimableGuestProfiles(groupId: string, service: SupabaseService): Promise<ClaimableGuestProfile[]> {
  const { data: memberships, error: membershipError } = await service
    .from("group_memberships")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("status", "active")
    .is("left_at", null);

  if (membershipError) {
    throw membershipError;
  }

  const userIds = (memberships ?? []).map((row: { user_id: string }) => row.user_id);
  if (!userIds.length) {
    return [];
  }

  const [{ data: profiles, error: profilesError }, { data: ratings, error: ratingsError }] = await Promise.all([
    service.from("profiles").select("id, display_name").in("id", userIds).eq("is_guest", true),
    service.from("group_rating_states").select("user_id, rating, rank").eq("group_id", groupId).in("user_id", userIds),
  ]);

  if (profilesError) {
    throw profilesError;
  }

  if (ratingsError) {
    throw ratingsError;
  }

  const ratingsByUserId = new Map((ratings ?? []).map((rating: { user_id: string }) => [rating.user_id, rating]));
  return (profiles ?? [])
    .map((profile: { id: string; display_name: string }) => {
      const rating = ratingsByUserId.get(profile.id) as { rating?: number | string; rank?: number | null } | undefined;
      return {
        id: profile.id,
        name: profile.display_name,
        rating: Math.round(Number(rating?.rating ?? 1500)),
        rank: rating?.rank ?? 0,
      };
    })
    .sort((a, b) => a.rank - b.rank || b.rating - a.rating || a.name.localeCompare(b.name));
}

async function assertClaimableGuests(groupId: string, guestProfileIds: string[], service: SupabaseService) {
  const claimable = await getClaimableGuestProfiles(groupId, service);
  const claimableIds = new Set(claimable.map((profile) => profile.id));

  if (guestProfileIds.some((id) => !claimableIds.has(id))) {
    throw new Error("Select an active guest profile from this group.");
  }
}

async function assertClaimDoesNotDuplicateParticipants(userId: string, guestProfileIds: string[], service: SupabaseService) {
  const { data, error } = await service
    .from("match_participants")
    .select("revision_id, user_id")
    .in("user_id", [userId, ...guestProfileIds]);

  if (error) {
    throw error;
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const nextCount = (counts.get(row.revision_id) ?? 0) + 1;
    if (nextCount > 1) {
      throw new Error("Those guest profiles cannot be merged because they appear together in a match.");
    }
    counts.set(row.revision_id, nextCount);
  }
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut().catch(() => undefined);
  redirect("/login");
}

export async function signInWithOtp(email: string, nextPath = DEFAULT_AUTH_REDIRECT_PATH): Promise<ActionResult<{ email: string; redirectTo?: string }>> {
  try {
    const parsedEmail = z.string().email().parse(email);
    const demoPlayer = getDemoPlayerByEmail(parsedEmail);
    const supabase = await createSupabaseServerClient();

    if (isDemoLoginEnabled() && demoPlayer) {
      const demoLogin = await ensureDemoFixtures(parsedEmail, getAuthCallbackUrl(getDemoPostLoginPath()));
      const { error } = await supabase.auth.verifyOtp({
        token_hash: demoLogin.tokenHash,
        type: "magiclink",
      });

      if (error) {
        throw error;
      }

      return {
        ok: true,
        data: { email: demoLogin.email, redirectTo: demoLogin.redirectTo },
        message: `Signed in as ${demoLogin.player.name}.`,
      };
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: parsedEmail,
      options: {
        emailRedirectTo: getAuthCallbackUrl(nextPath),
      },
    });

    if (error) {
      throw error;
    }

    return { ok: true, data: { email: parsedEmail }, message: "Check your email for the sign-in code." };
  } catch (error) {
    return { ok: false, message: getActionErrorMessage(error, "Could not send sign-in code.") };
  }
}

export async function signInWithGoogle(nextPath = DEFAULT_AUTH_REDIRECT_PATH): Promise<ActionResult<{ url: string }>> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: getAuthCallbackUrl(nextPath),
      },
    });

    if (error) {
      throw error;
    }

    if (!data.url) {
      throw new Error("Could not start Google sign-in.");
    }

    return { ok: true, data: { url: data.url } };
  } catch (error) {
    return { ok: false, message: getActionErrorMessage(error, "Could not start Google sign-in.") };
  }
}

export async function verifyEmailOtp(input: {
  email: string;
  token: string;
}): Promise<ActionResult<{ email: string }>> {
  try {
    const parsed = emailOtpSchema.parse(input);
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({
      email: parsed.email,
      token: parsed.token,
      type: "email",
    });

    if (error) {
      throw error;
    }

    return { ok: true, data: { email: parsed.email }, message: "Signed in." };
  } catch (error) {
    return { ok: false, message: getActionErrorMessage(error, "Could not verify sign-in code.") };
  }
}


export type InviteSummary = {
  groupId: string;
  groupName: string;
  memberCount: number;
  lastActiveText: string;
};

export type ClaimableGuestProfile = {
  id: string;
  name: string;
  rating: number;
  rank: number;
};

export async function completeOnboardingProfile(input: {
  firstName: string;
  lastName: string;
}): Promise<ActionResult<{ profileId: string }>> {
  try {
    const userId = await requireUserId();
    const parsed = onboardingProfileSchema.parse(input);
    const displayName = `${parsed.firstName} ${parsed.lastName}`;
    const service = createSupabaseServiceClient();
    const { data, error } = await service
      .from("profiles")
      .upsert({
        id: userId,
        first_name: parsed.firstName,
        last_name: parsed.lastName,
        display_name: displayName,
        is_guest: false,
      })
      .select("id")
      .single();

    if (error) {
      throw error;
    }

    revalidatePath("/onboarding");
    return { ok: true, data: { profileId: data.id } };
  } catch (error) {
    return { ok: false, message: getActionErrorMessage(error, "Could not save your profile.") };
  }
}

export async function getInviteSummary(token: string): Promise<ActionResult<InviteSummary>> {
  try {
    const service = createSupabaseServiceClient();
    const invite = await getInviteByToken(token, service);
    const [{ data: group, error: groupError }, { data: members, error: membersError }, { data: latestMatch }] = await Promise.all([
      service.from("groups").select("id, name").eq("id", invite.group_id).maybeSingle(),
      service
        .from("group_memberships")
        .select("user_id")
        .eq("group_id", invite.group_id)
        .eq("status", "active")
        .is("left_at", null),
      service
        .from("matches")
        .select("submitted_at")
        .eq("group_id", invite.group_id)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (groupError) {
      throw groupError;
    }

    if (membersError) {
      throw membersError;
    }

    if (!group) {
      throw new Error("This invite link is no longer valid.");
    }

    return {
      ok: true,
      data: {
        groupId: group.id,
        groupName: group.name,
        memberCount: members?.length ?? 0,
        lastActiveText: formatLastActive(latestMatch?.submitted_at),
      },
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not load invite." };
  }
}

export async function listClaimableGuestProfiles(groupId: string): Promise<ActionResult<{ profiles: ClaimableGuestProfile[] }>> {
  try {
    const userId = await requireUserId();
    const service = createSupabaseServiceClient();
    await ensureActiveMember(groupId, userId, service);
    const profiles = await getClaimableGuestProfiles(groupId, service);
    return { ok: true, data: { profiles } };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not load guest profiles." };
  }
}

export async function claimGuestProfiles(input: {
  groupId: string;
  guestProfileIds: string[];
}): Promise<ActionResult<{ groupId: string }>> {
  try {
    const userId = await requireUserId();
    const parsed = claimGuestProfilesSchema.parse({
      groupId: input.groupId,
      guestProfileIds: [...new Set(input.guestProfileIds)],
    });
    const service = createSupabaseServiceClient();
    await ensureActiveMember(parsed.groupId, userId, service);
    await assertClaimableGuests(parsed.groupId, parsed.guestProfileIds, service);
    await assertClaimDoesNotDuplicateParticipants(userId, parsed.guestProfileIds, service);

    await service.from("match_participants").update({ user_id: userId }).in("user_id", parsed.guestProfileIds);
    await service
      .from("group_memberships")
      .update({ status: "left", left_at: new Date().toISOString() })
      .eq("group_id", parsed.groupId)
      .in("user_id", parsed.guestProfileIds);
    await service
      .from("group_rating_states")
      .delete()
      .eq("group_id", parsed.groupId)
      .in("user_id", parsed.guestProfileIds);

    const matches = await fetchHistoricalMatches(parsed.groupId);
    const rebuilt = rebuildGroupRatingsFromMatches(matches);
    await persistRatingRebuild(parsed.groupId, rebuilt.ratings, rebuilt.events);
    revalidatePath(`/groups/${parsed.groupId}`);
    return { ok: true, data: { groupId: parsed.groupId } };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not claim guest profiles." };
  }
}
export async function createGuestPlayers(input: {
  groupId: string;
  names: string[];
}): Promise<ActionResult<{ players: AppPlayer[] }>> {
  try {
    const userId = await requireUserId();
    const parsed = guestPlayersSchema.parse(input);
    const service = createSupabaseServiceClient();
    await ensureActiveMember(parsed.groupId, userId, service);

    const names = parsed.names.map(normalizeGuestName);
    const { data: profiles, error: profilesError } = await service
      .from("profiles")
      .insert(
        names.map((name) => {
          const { firstName, lastName } = splitGuestName(name);
          return {
            display_name: name,
            first_name: firstName,
            last_name: lastName,
            is_guest: true,
          };
        }),
      )
      .select("id, display_name");

    if (profilesError) {
      throw profilesError;
    }

    if (!profiles || profiles.length !== names.length) {
      throw new Error("Could not create guest players.");
    }

    const memberships = profiles.map((profile: { id: string }) => ({
      group_id: parsed.groupId,
      user_id: profile.id,
      role: "member",
      status: "active",
    }));
    const ratings = profiles.map((profile: { id: string }) => ({
      group_id: parsed.groupId,
      user_id: profile.id,
      rating: 1500,
      rd: 350,
      volatility: 0.06,
      games_played: 0,
    }));

    const membershipResult = await service.from("group_memberships").insert(memberships);
    if (membershipResult.error) {
      throw membershipResult.error;
    }

    const ratingResult = await service.from("group_rating_states").insert(ratings);
    if (ratingResult.error) {
      throw ratingResult.error;
    }

    revalidatePath(`/groups/${parsed.groupId}`);
    return {
      ok: true,
      data: {
        players: profiles.map((profile: { id: string; display_name: string }) => ({
          id: profile.id,
          name: profile.display_name,
          initials: initialsFor(profile.display_name),
          role: "Member",
          rating: 1500,
          rd: 350,
          rank: 0,
          gamesPlayed: 0,
          status: "Active",
          isGuest: true,
        })),
      },
    };
  } catch (error) {
    return { ok: false, message: getActionErrorMessage(error, "Could not create guest players.") };
  }
}
export async function createGroup(input: {
  name: string;
  description?: string;
}): Promise<ActionResult<{ groupId: string }>> {
  try {
    const userId = await requireUserId();
    const parsed = groupSchema.parse(input);
    const service = createSupabaseServiceClient();

    const { data: group, error: groupError } = await service
      .from("groups")
      .insert({
        owner_user_id: userId,
        name: parsed.name,
        description: parsed.description,
      })
      .select("id")
      .single();

    if (groupError) {
      throw groupError;
    }

    await service.from("group_memberships").insert({
      group_id: group.id,
      user_id: userId,
      role: "owner",
      status: "active",
    });

    await service.from("group_rating_states").insert({
      group_id: group.id,
      user_id: userId,
      rating: 1500,
      rd: 350,
      volatility: 0.06,
      games_played: 0,
      rank: 1,
    });

    revalidatePath("/groups/new");
    return { ok: true, data: { groupId: group.id } };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not create group." };
  }
}

export async function createInvite(groupId: string): Promise<ActionResult<{ token: string; url: string }>> {
  try {
    const userId = await requireUserId();
    await ensureActiveMember(groupId, userId);

    const token = createInviteToken();
    const service = createSupabaseServiceClient();
    await service.from("group_invites").insert({
      group_id: groupId,
      token_hash: hashInviteToken(token),
      created_by_user_id: userId,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
    });

    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    return { ok: true, data: { token, url: `${origin}/join/${token}` } };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not create invite." };
  }
}

export async function joinGroupByInvite(token: string): Promise<ActionResult<{ groupId: string; claimableProfileCount: number }>> {
  try {
    const userId = await requireUserId();
    const service = createSupabaseServiceClient();
    const invite = await getInviteByToken(token, service);

    await service.from("group_memberships").upsert(
      {
        group_id: invite.group_id,
        user_id: userId,
        role: "member",
        status: "active",
        left_at: null,
      },
      { onConflict: "group_id,user_id" },
    );
    await service.from("group_invite_redemptions").insert({
      invite_id: invite.id,
      user_id: userId,
    });
    await service
      .from("group_invites")
      .update({ use_count: invite.use_count + 1 })
      .eq("id", invite.id);
    await service.from("group_rating_states").upsert(
      {
        group_id: invite.group_id,
        user_id: userId,
        rating: 1500,
        rd: 350,
        volatility: 0.06,
        games_played: 0,
      },
      { onConflict: "group_id,user_id" },
    );

    const claimableProfileCount = (await getClaimableGuestProfiles(invite.group_id, service)).length;
    revalidatePath(`/groups/${invite.group_id}`);
    return { ok: true, data: { groupId: invite.group_id, claimableProfileCount } };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not join group." };
  }
}

export async function leaveGroup(groupId: string): Promise<ActionResult<{ groupId: string }>> {
  try {
    const userId = await requireUserId();
    await ensureActiveMember(groupId, userId);
    const service = createSupabaseServiceClient();
    await service
      .from("group_memberships")
      .update({ status: "left", left_at: new Date().toISOString() })
      .eq("group_id", groupId)
      .eq("user_id", userId);

    revalidatePath(`/groups/${groupId}`);
    return { ok: true, data: { groupId } };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not leave group." };
  }
}

export async function submitMatch(input: MatchSubmissionInput): Promise<ActionResult<{ matchId: string }>> {
  try {
    const userId = await requireUserId();
    await ensureActiveMember(input.groupId, userId);
    const activeMemberIds = await getActiveMemberIds(input.groupId);
    const validated = validateMatchSubmission(input, { activeMemberIds });

    if (![...validated.teamAUserIds, ...validated.teamBUserIds].includes(userId)) {
      throw new Error("The submitting user must be one of the match players.");
    }

    const service = createSupabaseServiceClient();
    const { data: match, error: matchError } = await service
      .from("matches")
      .insert({
        group_id: validated.groupId,
        created_by_user_id: userId,
        status: "pending_confirmation",
        submitted_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (matchError) {
      throw matchError;
    }

    const { data: revision, error: revisionError } = await service
      .from("match_revisions")
      .insert({
        match_id: match.id,
        version: 1,
        submitted_by_user_id: userId,
        format: validated.format,
        reason: "Initial submission",
        status: "active",
      })
      .select("id")
      .single();

    if (revisionError) {
      throw revisionError;
    }

    await persistRevisionDetails(revision.id, validated);
    await service.from("matches").update({ active_revision_id: revision.id }).eq("id", match.id);
    await rebuildGroupRatings(validated.groupId);

    revalidatePath(`/groups/${validated.groupId}`);
    return { ok: true, data: { matchId: match.id } };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not submit match." };
  }
}

async function persistRevisionDetails(
  revisionId: string,
  validated: ValidatedMatchSubmission,
) {
  const service = createSupabaseServiceClient();
  const participants = [
    ...validated.teamAUserIds.map((userId, index) => ({
      revision_id: revisionId,
      user_id: userId,
      team: "A",
      slot: index + 1,
    })),
    ...validated.teamBUserIds.map((userId, index) => ({
      revision_id: revisionId,
      user_id: userId,
      team: "B",
      slot: index + 1,
    })),
  ];
  const games = validated.games.map((game) => ({
    revision_id: revisionId,
    game_number: game.gameNumber,
    team_a_score: game.teamAScore,
    team_b_score: game.teamBScore,
    winner_team: game.winnerTeam,
  }));

  const participantResult = await service.from("match_participants").insert(participants);
  if (participantResult.error) {
    throw participantResult.error;
  }

  const gameResult = await service.from("match_games").insert(games);
  if (gameResult.error) {
    throw gameResult.error;
  }
}

export async function confirmMatchRevision(revisionId: string): Promise<ActionResult<{ revisionId: string }>> {
  return reviewMatchRevision(revisionId, "confirmed");
}

export async function disputeMatchRevision(input: {
  revisionId: string;
  note: string;
}): Promise<ActionResult<{ revisionId: string }>> {
  const parsed = disputeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid dispute." };
  }

  return reviewMatchRevision(parsed.data.revisionId, "disputed", parsed.data.note);
}

async function reviewMatchRevision(
  revisionId: string,
  action: "confirmed" | "disputed",
  note?: string,
): Promise<ActionResult<{ revisionId: string }>> {
  try {
    const userId = await requireUserId();
    const service = createSupabaseServiceClient();
    const { data: revision, error } = await service
      .from("match_revisions")
      .select("id, match_id, submitted_by_user_id, matches(group_id)")
      .eq("id", revisionId)
      .single();

    if (error) {
      throw error;
    }

    const groupId = getNestedGroupId(revision.matches);
    await ensureActiveMember(groupId, userId);
    await assertOpposingTeamReviewer(revisionId, revision.submitted_by_user_id, userId);
    await service.from("match_confirmations").insert({
      revision_id: revisionId,
      user_id: userId,
      action,
      note,
    });

    if (action === "confirmed") {
      await service.from("matches").update({ status: "confirmed" }).eq("id", revision.match_id);
    } else {
      await service.from("matches").update({ status: "disputed" }).eq("id", revision.match_id);
    }

    revalidatePath(`/groups/${groupId}`);
    return { ok: true, data: { revisionId } };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not review match." };
  }
}

function getNestedGroupId(matches: { group_id: string } | Array<{ group_id: string }>) {
  return Array.isArray(matches) ? matches[0]?.group_id : matches.group_id;
}

async function assertOpposingTeamReviewer(
  revisionId: string,
  submittedByUserId: string,
  reviewerUserId: string,
) {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("match_participants")
    .select("user_id, team")
    .eq("revision_id", revisionId)
    .in("user_id", [submittedByUserId, reviewerUserId]);

  if (error) {
    throw error;
  }

  const submitter = data?.find((row: { user_id: string }) => row.user_id === submittedByUserId);
  const reviewer = data?.find((row: { user_id: string }) => row.user_id === reviewerUserId);
  if (!submitter || !reviewer || submitter.team === reviewer.team) {
    throw new Error("One player from the opposing team must confirm or dispute.");
  }
}

export async function reviseMatch(input: z.infer<typeof reviseSchema>): Promise<ActionResult<{ matchId: string }>> {
  try {
    const userId = await requireUserId();
    const parsed = reviseSchema.parse(input);
    await ensureActiveMember(parsed.groupId, userId);
    const activeMemberIds = await getActiveMemberIds(parsed.groupId);
    const validated = validateMatchSubmission(parsed, { activeMemberIds });
    const service = createSupabaseServiceClient();
    const { data: latest } = await service
      .from("match_revisions")
      .select("version")
      .eq("match_id", parsed.matchId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: revision, error } = await service
      .from("match_revisions")
      .insert({
        match_id: parsed.matchId,
        version: (latest?.version ?? 0) + 1,
        submitted_by_user_id: userId,
        format: validated.format,
        reason: parsed.reason,
        status: "active",
      })
      .select("id")
      .single();

    if (error) {
      throw error;
    }

    await persistRevisionDetails(revision.id, validated);
    await service
      .from("matches")
      .update({ active_revision_id: revision.id, status: "pending_confirmation" })
      .eq("id", parsed.matchId);
    await rebuildGroupRatings(parsed.groupId);

    revalidatePath(`/groups/${parsed.groupId}`);
    return { ok: true, data: { matchId: parsed.matchId } };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not revise match." };
  }
}

export async function rebuildGroupRatings(groupId: string): Promise<ActionResult<{ eventCount: number }>> {
  try {
    const userId = await requireUserId().catch(() => null);
    if (userId) {
      const membership = await ensureActiveMember(groupId, userId);
      if (membership.role === "member") {
        throw new Error("Only group admins can rebuild ratings.");
      }
    }

    const matches = await fetchHistoricalMatches(groupId);
    const rebuilt = rebuildGroupRatingsFromMatches(matches);
    await persistRatingRebuild(groupId, rebuilt.ratings, rebuilt.events);
    revalidatePath(`/groups/${groupId}`);
    return { ok: true, data: { eventCount: rebuilt.events.length } };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not rebuild ratings." };
  }
}

async function fetchHistoricalMatches(groupId: string): Promise<HistoricalMatch[]> {
  const service = createSupabaseServiceClient();
  const { data: matches, error } = await service
    .from("matches")
    .select("id, submitted_at, active_revision_id")
    .eq("group_id", groupId)
    .not("active_revision_id", "is", null)
    .order("submitted_at", { ascending: true });

  if (error) {
    throw error;
  }

  const historicalMatches: HistoricalMatch[] = [];

  for (const match of matches ?? []) {
    const { data: revision, error: revisionError } = await service
      .from("match_revisions")
      .select("id, format")
      .eq("id", match.active_revision_id)
      .single();
    if (revisionError) {
      throw revisionError;
    }

    const { data: participants, error: participantsError } = await service
      .from("match_participants")
      .select("user_id, team, slot")
      .eq("revision_id", revision.id)
      .order("slot", { ascending: true });
    if (participantsError) {
      throw participantsError;
    }

    const { data: games, error: gamesError } = await service
      .from("match_games")
      .select("team_a_score, team_b_score")
      .eq("revision_id", revision.id)
      .order("game_number", { ascending: true });
    if (gamesError) {
      throw gamesError;
    }

    historicalMatches.push({
      id: match.id,
      revisionId: revision.id,
      submittedAt: match.submitted_at,
      format: revision.format,
      teamAUserIds: (participants ?? [])
        .filter((participant: { team: string }) => participant.team === "A")
        .map((participant: { user_id: string }) => participant.user_id),
      teamBUserIds: (participants ?? [])
        .filter((participant: { team: string }) => participant.team === "B")
        .map((participant: { user_id: string }) => participant.user_id),
      games: (games ?? []).map((game: { team_a_score: number; team_b_score: number }) => ({
        teamAScore: game.team_a_score,
        teamBScore: game.team_b_score,
      })),
    });
  }

  return historicalMatches;
}

async function persistRatingRebuild(
  groupId: string,
  ratings: Map<string, RatingState>,
  events: RatingEvent[],
) {
  const service = createSupabaseServiceClient();
  await service.from("rating_events").delete().eq("group_id", groupId);
  await service.from("group_rating_states").delete().eq("group_id", groupId);

  const rankedRatings = Array.from(ratings.entries())
    .sort(([, a], [, b]) => b.rating - a.rating || a.rd - b.rd)
    .map(([userId, rating], index) => ({
      group_id: groupId,
      user_id: userId,
      rating: rating.rating,
      rd: rating.rd,
      volatility: rating.volatility,
      games_played: rating.gamesPlayed,
      rank: index + 1,
    }));

  if (rankedRatings.length) {
    const result = await service.from("group_rating_states").insert(rankedRatings);
    if (result.error) {
      throw result.error;
    }
  }

  if (events.length) {
    const result = await service.from("rating_events").insert(
      events.map((event) => ({
        group_id: groupId,
        match_id: event.matchId,
        revision_id: event.revisionId,
        user_id: event.userId,
        sequence: event.sequence,
        before_rating: event.before.rating,
        before_rd: event.before.rd,
        before_volatility: event.before.volatility,
        after_rating: event.after.rating,
        after_rd: event.after.rd,
        after_volatility: event.after.volatility,
      })),
    );
    if (result.error) {
      throw result.error;
    }
  }
}
