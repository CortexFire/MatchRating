"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { type AppPlayer } from "@/lib/app-data";
import {
  ensureDemoFixtures,
  getDemoPlayerByEmail,
  getDemoPostLoginPath,
  isDemoLoginEnabled,
} from "@/lib/demo-auth";
import { hashInviteToken } from "@/lib/invites/tokens";
import {
  createAuthCallbackIntent,
  getAuthCallbackIntentCookieForTrustedPublicSite,
} from "@/lib/auth/callback-intent";
import { getTrustedPublicSiteOrigin } from "@/lib/auth/public-site-origin";
import { DEFAULT_AUTH_NEXT_PATH, getSafeAuthNextPath } from "@/lib/auth/next-path";
import { profileCacheTag } from "@/lib/personalized-cache";
import {
  validateMatchSubmission,
  type MatchSubmissionInput,
} from "@/lib/matches/validation";
import { draftExpiresAt, validateActiveMatchDraft } from "@/lib/matches/drafts";
import { listVisibleGroupMemberships } from "@/lib/group-membership-visibility";
import { type CommandResult, toCommandError } from "@/lib/commands/result";
import { dispatchRatingRebuild } from "@/lib/ratings/rebuild-dispatch";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
  requireAuthenticatedSupabaseClient,
  requireUserId,
} from "@/lib/supabase/server";

export type ActionResult<T = unknown> =
  | { ok: true; data: T; message?: string }
  | { ok: false; message: string };

type CommandMetadata = { commandId?: string };
type RequiredCommandMetadata = { commandId: string };
export type MatchCommandResult = {
  matchId: string;
  revisionId: string;
  ratingJobId: string;
  ratingStatus: "queued" | "running" | "completed" | "failed";
};

async function executeCommand<T>(
  name: string,
  args: Record<string, unknown>,
  fallback: string,
): Promise<CommandResult<T>> {
  try {
    const { client } = await requireAuthenticatedSupabaseClient();
    const { data, error } = await client.rpc(name, args);
    if (error) return toCommandError(error, fallback);
    return { ok: true, data: data as T };
  } catch (error) {
    return toCommandError(error instanceof Error ? { message: error.message } : undefined, fallback);
  }
}

function commandId(value: CommandMetadata) {
  return value.commandId ?? randomUUID();
}

function scheduleReturnedRatingJob(result: CommandResult<{ ratingJobId?: string }>) {
  if (result.ok && result.data.ratingJobId) {
    const jobId = result.data.ratingJobId;
    try {
      after(async () => {
        try {
          await dispatchRatingRebuild(jobId);
        } catch (error) {
          console.error("rating_dispatch_failed", {
            jobId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    } catch (error) {
      console.error("rating_dispatch_schedule_failed", {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return result;
}

const groupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(280).optional().default(""),
});

const guestPlayersSchema = z.object({
  groupId: z.string().min(1),
  names: z.array(z.string().trim().min(1).max(80)).min(1).max(4),
});

const inviteTokenSchema = z.string().uuid();

const onboardingProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
});

const claimGuestProfilesSchema = z.object({
  groupId: z.string().min(1),
  guestProfileIds: z.array(z.string().min(1)).min(1).max(12),
});

const confirmSchema = z.object({
  groupId: z.string().uuid(),
  matchId: z.string().uuid(),
  revisionId: z.string().uuid(),
  commandId: z.string().uuid(),
});

const retryRatingSchema = z.object({
  jobId: z.string().uuid(),
  commandId: z.string().uuid(),
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

const activeDraftSchema = z.object({
  draftId: z.string().uuid().optional(),
  groupId: z.string().uuid(),
  format: z.enum(["singles", "doubles"]),
  teamAUserIds: z.array(z.string().uuid()),
  teamBUserIds: z.array(z.string().uuid()),
  games: z.array(
    z.object({
      teamAScore: z.number().int().min(0).max(99),
      teamBScore: z.number().int().min(0).max(99),
      winnerTeam: z.enum(["A", "B"]),
    }),
  ),
});

const reviseSchema = z
  .object({
    matchId: z.string().uuid(),
    expectedRevisionId: z.string().uuid(),
    commandId: z.string().uuid(),
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
          winnerTeam: z.enum(["A", "B"]),
        }),
      ),
    }),
  );

function getAuthCallbackUrl(nextPath = DEFAULT_AUTH_NEXT_PATH, intent?: string) {
  const callbackUrl = new URL("/auth/confirm", getTrustedPublicSiteOrigin());
  callbackUrl.searchParams.set("next", getSafeAuthNextPath(nextPath));
  if (intent) {
    callbackUrl.searchParams.set("auth_intent", intent);
  }
  return callbackUrl.toString();
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

// Legacy read helpers remain until a follow-up migration removes their unused source.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  use_count: number;
  revoked_at: string | null;
};

async function getInviteByToken(token: string, service: SupabaseService): Promise<InviteRow> {
  const parsedToken = inviteTokenSchema.safeParse(token);
  if (!parsedToken.success) {
    throw new Error("This invite link is no longer valid.");
  }

  const { data: invite, error } = await service
    .from("group_invites")
    .select("id, group_id, use_count, revoked_at")
    .eq("id", parsedToken.data)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!invite || invite.revoked_at) {
    throw new Error("This invite link is no longer valid.");
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
  const visibleGuests = (await listVisibleGroupMemberships([groupId], service)).filter(
    (membership) => membership.profile?.isGuest,
  );
  const userIds = visibleGuests.map((membership) => membership.userId);
  if (!userIds.length) {
    return [];
  }

  const { data: ratings, error: ratingsError } = await service
    .from("group_rating_states")
    .select("user_id, rating, rank")
    .eq("group_id", groupId)
    .in("user_id", userIds);

  if (ratingsError) {
    throw ratingsError;
  }

  const ratingsByUserId = new Map((ratings ?? []).map((rating: { user_id: string }) => [rating.user_id, rating]));
  return visibleGuests
    .map((membership) => {
      const rating = ratingsByUserId.get(membership.userId) as { rating?: number | string; rank?: number | null } | undefined;
      return {
        id: membership.userId,
        name: membership.profile?.displayName ?? "Unknown player",
        rating: Math.round(Number(rating?.rating ?? 1500)),
        rank: rating?.rank ?? 0,
      };
    })
    .sort((a, b) => a.rank - b.rank || b.rating - a.rating || a.name.localeCompare(b.name));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function assertClaimableGuests(groupId: string, guestProfileIds: string[], service: SupabaseService) {
  const claimable = await getClaimableGuestProfiles(groupId, service);
  const claimableIds = new Set(claimable.map((profile) => profile.id));

  if (guestProfileIds.some((id) => !claimableIds.has(id))) {
    throw new Error("Select an active guest profile from this group.");
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

export async function signInWithOtp(email: string, nextPath = DEFAULT_AUTH_NEXT_PATH): Promise<ActionResult<{ email: string; redirectTo?: string }>> {
  try {
    const parsedEmail = z.string().email().parse(email);
    const demoPlayer = getDemoPlayerByEmail(parsedEmail);
    const supabase = await createSupabaseServerClient();

    if (isDemoLoginEnabled() && demoPlayer) {
      const demoLogin = await ensureDemoFixtures(parsedEmail, getAuthCallbackUrl(getDemoPostLoginPath()));
      const { error } = await supabase.auth.verifyOtp({
        token_hash: demoLogin.tokenHash,
        type: "email",
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

    const intent = createAuthCallbackIntent();
    const { error } = await supabase.auth.signInWithOtp({
      email: parsedEmail,
      options: {
        emailRedirectTo: getAuthCallbackUrl(nextPath, intent),
      },
    });

    if (error) {
      throw error;
    }

    const cookie = getAuthCallbackIntentCookieForTrustedPublicSite();
    (await cookies()).set({ ...cookie, value: intent });

    return { ok: true, data: { email: parsedEmail }, message: "Check your email for the login link." };
  } catch (error) {
    return { ok: false, message: getActionErrorMessage(error, "Could not send login link.") };
  }
}


// Retained for a potential future code-entry flow. This verifier is email-only;
// an SMS flow must request and verify a phone OTP through separate phone-specific handling.
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

    const cookie = getAuthCallbackIntentCookieForTrustedPublicSite();
    (await cookies()).set({ ...cookie, value: "", maxAge: 0 });

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

    updateTag(profileCacheTag(userId));
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
    const [{ data: group, error: groupError }, visibleMemberships, { data: latestMatch }] = await Promise.all([
      service.from("groups").select("id, name").eq("id", invite.group_id).maybeSingle(),
      listVisibleGroupMemberships([invite.group_id], service),
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

    if (!group) {
      throw new Error("This invite link is no longer valid.");
    }

    return {
      ok: true,
      data: {
        groupId: group.id,
        groupName: group.name,
        memberCount: visibleMemberships.length,
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
  commandId?: string;
}): Promise<ActionResult<{ groupId: string; ratingJobId?: string }>> {
  const parsed = claimGuestProfilesSchema.safeParse({ ...input, guestProfileIds: [...new Set(input.guestProfileIds)] });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Could not claim guest profiles." };
  const result = await executeCommand<{ groupId: string; ratingJobId?: string }>("command_claim_guest_profiles", {
    p_command_id: commandId(input), p_group_id: parsed.data.groupId, p_guest_ids: parsed.data.guestProfileIds,
  }, "Could not claim guest profiles.");
  scheduleReturnedRatingJob(result);
  if (result.ok) revalidatePath(`/groups/${parsed.data.groupId}`);
  return result;
}
export async function createGuestPlayers(input: {
  groupId: string;
  names: string[];
  commandId?: string;
}): Promise<ActionResult<{ players: AppPlayer[] }>> {
  const parsed = guestPlayersSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Could not create guest players." };
  const result = await executeCommand<{ players: Array<{ id: string; name: string }> }>("command_create_guest_players", {
    p_command_id: commandId(input), p_group_id: parsed.data.groupId, p_names: parsed.data.names.map(normalizeGuestName),
  }, "Could not create guest players.");
  if (!result.ok) return result;
  revalidatePath(`/groups/${parsed.data.groupId}`);
  return { ok: true, data: { players: result.data.players.map((player) => ({ id: player.id, name: player.name, initials: initialsFor(player.name), role: "Guest", rating: 1500, rd: 350, rank: 0, gamesPlayed: 0, status: "Inactive", isGuest: true })) } };
}
export async function createGroup(input: {
  name: string;
  description?: string;
  commandId?: string;
}): Promise<ActionResult<{ groupId: string }>> {
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Could not create group." };
  const result = await executeCommand<{ groupId: string }>("command_create_group", {
    p_command_id: commandId(input), p_name: parsed.data.name, p_description: parsed.data.description,
  }, "Could not create group.");
  if (result.ok) revalidatePath("/groups/new");
  return result;
}

export async function getOrCreateInvite(groupId: string): Promise<ActionResult<{ token: string; url: string }>> {
  try {
    const userId = await requireUserId();
    const service = createSupabaseServiceClient();
    await ensureActiveMember(groupId, userId, service);

    const { data: existingInvite, error: existingError } = await service
      .from("group_invites")
      .select("id")
      .eq("group_id", groupId)
      .is("revoked_at", null)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    const origin = getTrustedPublicSiteOrigin();
    if (existingInvite?.id) {
      return { ok: true, data: { token: existingInvite.id, url: `${origin}/join/${existingInvite.id}` } };
    }

    const inviteId = randomUUID();
    const { data: invite, error: insertError } = await service
      .from("group_invites")
      .insert({
        id: inviteId,
        group_id: groupId,
        token_hash: hashInviteToken(inviteId),
        created_by_user_id: userId,
      })
      .select("id")
      .single();

    if (insertError) {
      if ((insertError as { code?: string }).code === "23505") {
        const { data: concurrentInvite, error: concurrentLookupError } = await service
          .from("group_invites")
          .select("id")
          .eq("group_id", groupId)
          .is("revoked_at", null)
          .maybeSingle();

        if (concurrentLookupError) {
          throw concurrentLookupError;
        }

        if (concurrentInvite?.id) {
          return {
            ok: true,
            data: { token: concurrentInvite.id, url: `${origin}/join/${concurrentInvite.id}` },
          };
        }
      }
      throw insertError;
    }

    if (!invite) {
      throw new Error("Could not load invite.");
    }

    return { ok: true, data: { token: invite.id, url: `${origin}/join/${invite.id}` } };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not load invite." };
  }
}

export async function joinGroupByInvite(token: string, metadata: CommandMetadata = {}): Promise<ActionResult<{ groupId: string; claimableProfileCount: number }>> {
  const parsed = inviteTokenSchema.safeParse(token);
  if (!parsed.success) return { ok: false, message: "This invite link is no longer valid." };
  const result = await executeCommand<{ groupId: string; claimableProfileCount: number }>("command_join_group_by_invite", {
    p_command_id: commandId(metadata), p_invite_id: parsed.data,
  }, "Could not join group.");
  if (result.ok) revalidatePath(`/groups/${result.data.groupId}`);
  return result;
}

export async function leaveGroup(groupId: string, metadata: CommandMetadata = {}): Promise<ActionResult<{ groupId: string }>> {
  const result = await executeCommand<{ groupId: string }>("command_leave_group", {
    p_command_id: commandId(metadata),
    p_group_id: groupId,
  }, "Could not leave group.");
  if (result.ok) revalidatePath(`/groups/${groupId}`);
  return result;
}


type ActiveDraftInput = MatchSubmissionInput & { draftId?: string };
type EditableDraftRow = {
  id: string;
  group_id: string;
  created_by_user_id: string;
  team_a_user_ids: string[];
  team_b_user_ids: string[];
  expires_at: string;
  submitted_match_id: string | null;
};

export async function saveActiveMatchDraft(input: ActiveDraftInput): Promise<ActionResult<{ draftId: string }>> {
  try {
    const userId = await requireUserId();
    const parsed = activeDraftSchema.parse(input);
    const service = createSupabaseServiceClient();
    await ensureActiveMember(parsed.groupId, userId, service);
    const activeMemberIds = await getActiveMemberIds(parsed.groupId);
    const draft = validateActiveMatchDraft(parsed, { activeMemberIds });
    const expires_at = draftExpiresAt();
    const values = {
      group_id: draft.groupId,
      format: draft.format,
      team_a_user_ids: draft.teamAUserIds,
      team_b_user_ids: draft.teamBUserIds,
      games: draft.games,
      expires_at,
      updated_at: new Date().toISOString(),
    };

    if (parsed.draftId) {
      const existing = await getEditableDraft(parsed.draftId, userId, service);
      if (existing.group_id !== parsed.groupId) {
        throw new Error("This active match belongs to another group.");
      }

      const { data, error } = await service
        .from("active_match_drafts")
        .update(values)
        .eq("id", parsed.draftId)
        .is("submitted_match_id", null)
        .gt("expires_at", new Date().toISOString())
        .or(
          `created_by_user_id.eq.${userId},team_a_user_ids.cs.{${userId}},team_b_user_ids.cs.{${userId}}`,
        )
        .select("id")
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error("This active match is unavailable or you no longer have access.");
      }

      revalidateDraftPaths(parsed.groupId);
      return { ok: true, data: { draftId: data.id } };
    }

    const { data, error } = await service
      .from("active_match_drafts")
      .insert({ ...values, created_by_user_id: userId })
      .select("id")
      .single();
    if (error) {
      throw error;
    }

    revalidateDraftPaths(parsed.groupId);
    return { ok: true, data: { draftId: data.id } };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not save active match." };
  }
}

async function getEditableDraft(draftId: string, userId: string, service: SupabaseService): Promise<EditableDraftRow> {
  const { data, error } = await service
    .from("active_match_drafts")
    .select("id, group_id, created_by_user_id, team_a_user_ids, team_b_user_ids, expires_at, submitted_match_id")
    .eq("id", draftId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const draft = data as EditableDraftRow | null;
  if (!draft) {
    throw new Error("This active match is unavailable.");
  }

  if (draft.submitted_match_id) {
    throw new Error("This active match was already submitted.");
  }

  if (Date.parse(draft.expires_at) <= Date.now()) {
    await service
      .from("active_match_drafts")
      .delete()
      .eq("id", draftId)
      .eq("expires_at", draft.expires_at)
      .is("submitted_match_id", null);
    throw new Error("This active match expired. Start a new match.");
  }

  const canEdit =
    draft.created_by_user_id === userId ||
    draft.team_a_user_ids.includes(userId) ||
    draft.team_b_user_ids.includes(userId);
  if (!canEdit) {
    throw new Error("Only the match creator or a participant can edit this active match.");
  }

  return draft;
}

function revalidateDraftPaths(groupId: string) {
  revalidatePath("/home");
  revalidatePath(`/groups/${groupId}`);
}

function revalidateRatingPaths(groupId: string) {
  revalidatePath(`/groups/${groupId}`);
  revalidatePath(`/groups/${groupId}/members`);
  revalidatePath(`/groups/${groupId}/rankings`);
}

export async function submitMatch(input: ActiveDraftInput & RequiredCommandMetadata): Promise<ActionResult<MatchCommandResult>> {
  if (!z.string().uuid().safeParse(input.commandId).success) {
    return { ok: false, message: "A command ID is required." };
  }
  const parsed = activeDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Could not submit match." };
  const validated = validateMatchSubmission(parsed.data);
  if (parsed.data.draftId) {
    try {
      const userId = await requireUserId();
      const existing = await getEditableDraft(parsed.data.draftId, userId, createSupabaseServiceClient());
      if (existing.group_id !== validated.groupId) {
        throw new Error("This active match belongs to another group.");
      }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Could not submit match." };
    }
  }
  const result = await executeCommand<MatchCommandResult>("command_submit_match", {
    p_command_id: input.commandId, p_group_id: validated.groupId, p_draft_id: parsed.data.draftId ?? null,
    p_format: validated.format, p_team_a: validated.teamAUserIds, p_team_b: validated.teamBUserIds,
    p_games: validated.games.map(({ teamAScore, teamBScore, winnerTeam }) => ({
      teamAScore,
      teamBScore,
      winnerTeam,
    })),
  }, "Could not submit match.");
  scheduleReturnedRatingJob(result);
  if (result.ok) revalidateRatingPaths(validated.groupId);
  return result;
}

export async function confirmMatchRevision(input: z.infer<typeof confirmSchema>): Promise<ActionResult<{ revisionId: string }>> {
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Could not confirm match." };
  }
  const result = await executeCommand<{ revisionId: string }>("command_review_match", {
    p_command_id: parsed.data.commandId,
    p_revision_id: parsed.data.revisionId,
    p_action: "confirmed",
  }, "Could not review match.");
  if (result.ok) {
    revalidatePath("/groups");
    revalidatePath("/matches/review");
    revalidatePath(`/groups/${parsed.data.groupId}/matches/${parsed.data.matchId}`);
  }
  return result;
}
export async function reviseMatch(input: z.infer<typeof reviseSchema>): Promise<ActionResult<MatchCommandResult>> {
  const parsed = reviseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Could not revise match." };
  const validated = validateMatchSubmission(parsed.data);
  const result = await executeCommand<MatchCommandResult>("command_revise_match", {
    p_command_id: parsed.data.commandId, p_match_id: parsed.data.matchId, p_expected_revision_id: parsed.data.expectedRevisionId,
    p_format: validated.format, p_team_a: validated.teamAUserIds,
    p_team_b: validated.teamBUserIds, p_games: validated.games.map(({ teamAScore, teamBScore, winnerTeam }) => ({
      teamAScore,
      teamBScore,
      winnerTeam,
    })),
  }, "Could not revise match.");
  scheduleReturnedRatingJob(result);
  if (result.ok) revalidateMatchPaths(parsed.data.groupId, parsed.data.matchId);
  return result;
}

export async function disputeAndReviseMatch(input: z.infer<typeof reviseSchema>): Promise<ActionResult<MatchCommandResult>> {
  const parsed = reviseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Could not correct match." };
  const validated = validateMatchSubmission(parsed.data);
  const result = await executeCommand<MatchCommandResult>("command_dispute_and_revise_match", {
    p_command_id: parsed.data.commandId, p_match_id: parsed.data.matchId, p_expected_revision_id: parsed.data.expectedRevisionId,
    p_format: validated.format, p_team_a: validated.teamAUserIds, p_team_b: validated.teamBUserIds,
    p_games: validated.games.map(({ teamAScore, teamBScore, winnerTeam }) => ({
      teamAScore,
      teamBScore,
      winnerTeam,
    })),
  }, "Could not correct match.");
  scheduleReturnedRatingJob(result);
  if (result.ok) revalidateMatchPaths(parsed.data.groupId, parsed.data.matchId);
  return result;
}

function revalidateMatchPaths(groupId: string, matchId: string) {
  revalidatePath("/matches/review");
  revalidateRatingPaths(groupId);
  revalidatePath(`/groups/${groupId}/history`);
  revalidatePath(`/groups/${groupId}/matches/${matchId}`);
}

export async function retryRatingRebuild(
  input: z.infer<typeof retryRatingSchema>,
): Promise<ActionResult<{ ratingJobId: string; ratingStatus: "queued" }>> {
  const parsed = retryRatingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Could not retry ratings." };
  }
  const result = await executeCommand<{ ratingJobId: string; ratingStatus: "queued" }>("retry_rating_rebuild", {
    p_command_id: parsed.data.commandId,
    p_job_id: parsed.data.jobId,
  }, "Could not retry ratings.");
  scheduleReturnedRatingJob(result);
  if (result.ok) revalidatePath("/groups");
  return result;
}
