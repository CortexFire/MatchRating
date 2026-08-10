import { createSupabaseServerClient, createSupabaseServiceClient, requireUserId } from "@/lib/supabase/server";
import { cache } from "react";
import { type MatchFormat, type MatchGameInput } from "@/lib/matches/validation";
import {
  buildMatchViews,
  type MatchReadRows,
  type MatchView,
} from "@/lib/matches/read-model";

export type AppGroup = {
  id: string;
  name: string;
  description: string;
  memberCount: number;
};

export type AppProfile = {
  id: string;
  name: string;
  initials: string;
};

export type AppActiveMatchDraft = {
  id: string;
  groupId: string;
  groupName: string;
  format: MatchFormat;
  teamA: string[];
  teamB: string[];
  scores: string[];
  role: "Creator" | "Viewer";
};

export type AppActiveMatchDraftDetail = AppActiveMatchDraft & {
  canEdit: boolean;
  initialMatch: {
    format: MatchFormat;
    teamAUserIds: string[];
    teamBUserIds: string[];
    games: MatchGameInput[];
  };
};

export type AppPlayer = {
  id: string;
  name: string;
  initials: string;
  role: "Owner" | "Admin" | "Member";
  rating: number;
  rd: number;
  rank: number;
  gamesPlayed: number;
  status: "Active" | "Pending review";
  isGuest?: boolean;
};

type GroupRow = {
  id: string;
  name: string;
  description: string;
};

type MembershipRow = {
  group_id: string;
  role: "owner" | "admin" | "member";
  user_id: string;
};

type ProfileRow = {
  id: string;
  display_name: string;
  is_guest?: boolean;
};

type RatingRow = {
  user_id: string;
  rating: number | string;
  rd: number | string;
  rank: number | null;
  games_played: number;
};

type MatchGroupRow = {
  group_id: string;
};

const getCurrentUserId = cache(requireUserId);
const canCurrentUserReadGroupCached = cache(async (groupId: string) => {
  if (!isUuid(groupId)) return false;
  const userId = await getCurrentUserId();
  return canReadGroup(groupId, userId, createSupabaseServiceClient());
});

export type AppMatchSummary = MatchView;
export type AppPendingReview = MatchView;
export type AppMatchDetail = MatchView;

export type AppRatingRebuildStatusValue = "queued" | "running" | "completed" | "failed" | null;
export type AppRatingRebuildStatus = {
  id: string | null;
  status: AppRatingRebuildStatusValue;
  canRetry: boolean;
};

export async function getGroupRatingRebuildStatus(groupId: string): Promise<AppRatingRebuildStatus> {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("get_rating_rebuild_status", { p_group_id: groupId });
  if (error) throw error;
  const status = data as Partial<AppRatingRebuildStatus> | null;
  return {
    id: status?.id ?? null,
    status: status?.status ?? null,
    canRetry: status?.canRetry === true,
  };
}

type ActiveMatchDraftRow = {
  id: string;
  group_id: string;
  created_by_user_id: string;
  format: MatchFormat;
  team_a_user_ids: string[];
  team_b_user_ids: string[];
  games: unknown;
  expires_at: string;
};

export async function getCurrentProfile(): Promise<AppProfile> {
  const userId = await requireUserId();
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("profiles")
    .select("id, display_name")
    .eq("id", userId)
    .single();

  if (error) {
    throw error;
  }

  return toProfile(data as ProfileRow);
}

export async function listCurrentUserGroups(): Promise<AppGroup[]> {
  const userId = await requireUserId();
  const service = createSupabaseServiceClient();
  const { data: memberships, error } = await service
    .from("group_memberships")
    .select("group_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .is("left_at", null);

  if (error) {
    throw error;
  }

  const groupIds = [...new Set((memberships ?? []).map((row: { group_id: string }) => row.group_id))];
  if (!groupIds.length) {
    return [];
  }

  const [{ data: groups, error: groupsError }, { data: memberRows, error: membersError }] = await Promise.all([
    service.from("groups").select("id, name, description").in("id", groupIds).is("archived_at", null),
    service
      .from("group_memberships")
      .select("group_id")
      .in("group_id", groupIds)
      .eq("status", "active")
      .is("left_at", null),
  ]);

  if (groupsError) {
    throw groupsError;
  }

  if (membersError) {
    throw membersError;
  }

  const memberCounts = countBy(memberRows ?? [], "group_id");
  return (groups ?? []).map((group: GroupRow) => ({
    id: group.id,
    name: group.name,
    description: group.description,
    memberCount: memberCounts.get(group.id) ?? 0,
  }));
}

export async function getGroup(groupId: string): Promise<AppGroup | null> {
  await ensureCurrentUserCanReadGroup(groupId);
  const service = createSupabaseServiceClient();
  const [{ data: group, error }, { data: members, error: membersError }] = await Promise.all([
    service.from("groups").select("id, name, description").eq("id", groupId).is("archived_at", null).maybeSingle(),
    service
      .from("group_memberships")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("status", "active")
      .is("left_at", null),
  ]);

  if (error) {
    throw error;
  }

  if (membersError) {
    throw membersError;
  }

  if (!group) {
    return null;
  }

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    memberCount: members?.length ?? 0,
  };
}

export async function getMatchGroupId(matchId: string): Promise<string | null> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("matches")
    .select("group_id")
    .eq("id", matchId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as MatchGroupRow | null)?.group_id ?? null;
}

export async function listGroupMatches(groupId: string, options?: { limit?: number }): Promise<AppMatchSummary[]> {
  const userId = await getCurrentUserId();
  const service = createSupabaseServiceClient();
  if (!(await canCurrentUserReadGroupCached(groupId))) return [];

  let query = service
    .from("matches")
    .select("id, group_id, active_revision_id, status, submitted_at")
    .eq("group_id", groupId)
    .not("active_revision_id", "is", null)
    .order("submitted_at", { ascending: false })
    .order("id", { ascending: false });
  if (options?.limit !== undefined) {
    query = query.limit(options.limit);
  }
  const { data, error } = await query;
  if (error) throw error;
  return loadMatchViews((data ?? []) as MatchReadRows["matches"], userId, service);
}

export async function listPendingReviewsForCurrentUser(): Promise<AppPendingReview[]> {
  const userId = await requireUserId();
  const service = createSupabaseServiceClient();
  const { data: memberships, error: membershipError } = await service
    .from("group_memberships")
    .select("group_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .is("left_at", null);
  if (membershipError) throw membershipError;
  const groupIds = [...new Set((memberships ?? []).map((row: { group_id: string }) => row.group_id))];
  if (!groupIds.length) return [];

  const { data, error } = await service
    .from("matches")
    .select("id, group_id, active_revision_id, status, submitted_at")
    .in("group_id", groupIds)
    .eq("status", "pending_confirmation")
    .not("active_revision_id", "is", null)
    .order("submitted_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw error;
  const matches = await loadMatchViews((data ?? []) as MatchReadRows["matches"], userId, service);
  return matches.filter((match) => match.canReview);
}

export async function getGroupMatchDetail(groupId: string, matchId: string): Promise<AppMatchDetail | null> {
  const userId = await requireUserId();
  const service = createSupabaseServiceClient();
  if (!isUuid(groupId) || !isUuid(matchId) || !(await canReadGroup(groupId, userId, service))) return null;

  const { data, error } = await service
    .from("matches")
    .select("id, group_id, active_revision_id, status, submitted_at")
    .eq("group_id", groupId)
    .eq("id", matchId)
    .not("active_revision_id", "is", null)
    .maybeSingle();
  if (error) throw error;
  const row = data as MatchReadRows["matches"][number] | null;
  if (!row || row.id !== matchId || row.group_id !== groupId) return null;
  return (await loadMatchViews([row], userId, service))[0] ?? null;
}

export async function canCurrentUserReadGroup(groupId: string): Promise<boolean> {
  return canCurrentUserReadGroupCached(groupId);
}

async function canReadGroup(
  groupId: string,
  userId: string,
  service: ReturnType<typeof createSupabaseServiceClient>,
) {
  const { data, error } = await service
    .from("group_memberships")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .eq("status", "active")
    .is("left_at", null)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function loadMatchViews(
  matches: MatchReadRows["matches"],
  currentUserId: string,
  service: ReturnType<typeof createSupabaseServiceClient>,
) {
  if (!matches.length) return [];
  const groupIds = [...new Set(matches.map((match) => match.group_id))];
  const revisionIds = [...new Set(matches.map((match) => match.active_revision_id))];
  const [groupsResult, revisionsResult, participantsResult, gamesResult, confirmationsResult, ratingEventsResult] = await Promise.all([
    service.from("groups").select("id, name").in("id", groupIds),
    service.from("match_revisions").select("id, match_id, submitted_by_user_id, format").in("id", revisionIds),
    service.from("match_participants").select("revision_id, user_id, team, slot").in("revision_id", revisionIds),
    service.from("match_games").select("revision_id, game_number, team_a_score, team_b_score, winner_team").in("revision_id", revisionIds),
    service.from("match_confirmations").select("revision_id, user_id, action, created_at").in("revision_id", revisionIds),
    service.from("rating_events").select("revision_id, user_id, before_rating, after_rating").in("revision_id", revisionIds),
  ]);
  const firstError = [groupsResult, revisionsResult, participantsResult, gamesResult, confirmationsResult, ratingEventsResult]
    .find((result) => result.error)?.error;
  if (firstError) throw firstError;

  const participants = (participantsResult.data ?? []) as MatchReadRows["participants"];
  const playerIds = [...new Set(participants.map((participant) => participant.user_id))];
  const profilesResult = await service.from("profiles").select("id, display_name").in("id", playerIds);
  if (profilesResult.error) throw profilesResult.error;

  return buildMatchViews({
    currentUserId,
    matches,
    groups: (groupsResult.data ?? []) as MatchReadRows["groups"],
    revisions: (revisionsResult.data ?? []) as MatchReadRows["revisions"],
    participants,
    games: (gamesResult.data ?? []) as MatchReadRows["games"],
    confirmations: (confirmationsResult.data ?? []) as MatchReadRows["confirmations"],
    ratingEvents: (ratingEventsResult.data ?? []) as MatchReadRows["ratingEvents"],
    profiles: (profilesResult.data ?? []) as MatchReadRows["profiles"],
  });
}


export async function listCurrentUserActiveMatchDrafts(): Promise<AppActiveMatchDraft[]> {
  const userId = await requireUserId();
  const service = createSupabaseServiceClient();
  const drafts = await listVisibleDraftRows(userId, undefined, service);
  return hydrateDraftSummaries(drafts, userId, service);
}

export async function listGroupActiveMatchDrafts(groupId: string): Promise<AppActiveMatchDraft[]> {
  const userId = await getCurrentUserId();
  await ensureCurrentUserCanReadGroup(groupId);
  const service = createSupabaseServiceClient();
  const drafts = await listVisibleDraftRows(userId, groupId, service);
  return hydrateDraftSummaries(drafts, userId, service);
}

export async function getActiveMatchDraft(draftId: string): Promise<AppActiveMatchDraftDetail | null> {
  const userId = await requireUserId();
  const service = createSupabaseServiceClient();
  await deleteExpiredDrafts(service);
  const { data, error } = await service
    .from("active_match_drafts")
    .select("id, group_id, created_by_user_id, format, team_a_user_ids, team_b_user_ids, games, expires_at")
    .eq("id", draftId)
    .is("submitted_match_id", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const draft = data as ActiveMatchDraftRow | null;
  if (!draft || !isVisibleDraft(draft, userId)) {
    return null;
  }

  const [summary] = await hydrateDraftSummaries([draft], userId, service);
  if (!summary) {
    return null;
  }

  return {
    ...summary,
    canEdit: draft.created_by_user_id === userId,
    initialMatch: {
      format: draft.format,
      teamAUserIds: draft.team_a_user_ids,
      teamBUserIds: draft.team_b_user_ids,
      games: parseDraftGames(draft.games),
    },
  };
}

async function listVisibleDraftRows(userId: string, groupId: string | undefined, service: ReturnType<typeof createSupabaseServiceClient>) {
  await deleteExpiredDrafts(service);
  let query = service
    .from("active_match_drafts")
    .select("id, group_id, created_by_user_id, format, team_a_user_ids, team_b_user_ids, games, expires_at")
    .is("submitted_match_id", null)
    .gt("expires_at", new Date().toISOString())
    .or(`created_by_user_id.eq.${userId},team_a_user_ids.cs.{${userId}},team_b_user_ids.cs.{${userId}}`);

  if (groupId) {
    query = query.eq("group_id", groupId);
  }

  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) {
    throw error;
  }

  return (data ?? []) as ActiveMatchDraftRow[];
}

async function deleteExpiredDrafts(service: ReturnType<typeof createSupabaseServiceClient>) {
  const { error } = await service
    .from("active_match_drafts")
    .delete()
    .lt("expires_at", new Date().toISOString())
    .is("submitted_match_id", null);

  if (error) {
    throw error;
  }
}

async function hydrateDraftSummaries(
  drafts: ActiveMatchDraftRow[],
  userId: string,
  service: ReturnType<typeof createSupabaseServiceClient>,
): Promise<AppActiveMatchDraft[]> {
  if (!drafts.length) {
    return [];
  }

  const groupIds = [...new Set(drafts.map((draft) => draft.group_id))];
  const playerIds = [...new Set(drafts.flatMap((draft) => [...draft.team_a_user_ids, ...draft.team_b_user_ids]))];
  const [{ data: groups, error: groupsError }, { data: profiles, error: profilesError }] = await Promise.all([
    service.from("groups").select("id, name").in("id", groupIds),
    service.from("profiles").select("id, display_name").in("id", playerIds),
  ]);

  if (groupsError) {
    throw groupsError;
  }

  if (profilesError) {
    throw profilesError;
  }

  const groupsById = new Map((groups ?? []).map((group: { id: string; name: string }) => [group.id, group.name]));
  const profilesById = new Map((profiles ?? []).map((profile: ProfileRow) => [profile.id, profile.display_name]));

  return drafts.map((draft) => ({
    id: draft.id,
    groupId: draft.group_id,
    groupName: groupsById.get(draft.group_id) ?? "Group",
    format: draft.format,
    teamA: draft.team_a_user_ids.map((id: string) => profilesById.get(id) ?? "Unknown player"),
    teamB: draft.team_b_user_ids.map((id: string) => profilesById.get(id) ?? "Unknown player"),
    scores: parseDraftGames(draft.games).map((game) => `${game.teamAScore}-${game.teamBScore}`),
    role: draft.created_by_user_id === userId ? "Creator" : "Viewer",
  }));
}

function isVisibleDraft(draft: ActiveMatchDraftRow, userId: string) {
  return (
    draft.created_by_user_id === userId ||
    draft.team_a_user_ids.includes(userId) ||
    draft.team_b_user_ids.includes(userId)
  );
}

function parseDraftGames(value: unknown): MatchGameInput[] {
  if (!Array.isArray(value)) {
    return [{ teamAScore: 0, teamBScore: 0 }];
  }

  return value
    .map((game) => ({
      teamAScore: Number((game as { teamAScore?: unknown }).teamAScore ?? 0),
      teamBScore: Number((game as { teamBScore?: unknown }).teamBScore ?? 0),
    }))
    .filter((game) => Number.isFinite(game.teamAScore) && Number.isFinite(game.teamBScore));
}

export async function listGroupPlayers(groupId: string): Promise<AppPlayer[]> {
  await ensureCurrentUserCanReadGroup(groupId);
  const service = createSupabaseServiceClient();
  const { data: memberships, error } = await service
    .from("group_memberships")
    .select("user_id, role")
    .eq("group_id", groupId)
    .eq("status", "active")
    .is("left_at", null);

  if (error) {
    throw error;
  }

  const memberRows = (memberships ?? []) as MembershipRow[];
  const userIds = memberRows.map((membership) => membership.user_id);
  if (!userIds.length) {
    return [];
  }

  const [{ data: profiles, error: profilesError }, { data: ratings, error: ratingsError }] = await Promise.all([
    service.from("profiles").select("id, display_name, is_guest").in("id", userIds),
    service
      .from("group_rating_states")
      .select("user_id, rating, rd, rank, games_played")
      .eq("group_id", groupId)
      .in("user_id", userIds),
  ]);

  if (profilesError) {
    throw profilesError;
  }

  if (ratingsError) {
    throw ratingsError;
  }

  const profilesById = new Map((profiles ?? []).map((profile: ProfileRow) => [profile.id, profile]));
  const ratingsByUserId = new Map((ratings ?? []).map((rating: RatingRow) => [rating.user_id, rating]));

  return memberRows
    .map((membership, index) => {
      const profile = profilesById.get(membership.user_id);
      const rating = ratingsByUserId.get(membership.user_id);
      const name = profile?.display_name ?? "Unknown player";

      return {
        id: membership.user_id,
        name,
        initials: initialsFor(name),
        role: displayRole(membership.role),
        rating: Math.round(Number(rating?.rating ?? 1500)),
        rd: Math.round(Number(rating?.rd ?? 350)),
        rank: rating?.rank ?? index + 1,
        gamesPlayed: rating?.games_played ?? 0,
        status: "Active",
        isGuest: profile?.is_guest ?? false,
      } satisfies AppPlayer;
    })
    .sort((a, b) => a.rank - b.rank || b.rating - a.rating || a.name.localeCompare(b.name));
}

async function ensureCurrentUserCanReadGroup(groupId: string) {
  if (!(await canCurrentUserReadGroupCached(groupId))) {
    throw new Error("You are not an active member of this group.");
  }
}

function toProfile(row: ProfileRow): AppProfile {
  return {
    id: row.id,
    name: row.display_name,
    initials: initialsFor(row.display_name),
  };
}

function initialsFor(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function displayRole(role: MembershipRow["role"]): AppPlayer["role"] {
  if (role === "owner") {
    return "Owner";
  }

  if (role === "admin") {
    return "Admin";
  }

  return "Member";
}

function countBy<T extends Record<string, string>>(rows: T[], key: keyof T) {
  const counts = new Map<string, number>();
  rows.forEach((row) => counts.set(row[key], (counts.get(row[key]) ?? 0) + 1));
  return counts;
}



