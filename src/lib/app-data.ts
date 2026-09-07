import { createSupabaseServerClient, createSupabaseServiceClient, requireUserId } from "@/lib/supabase/server";
import { cache } from "react";
import { performanceSdFromLogMean } from "@/lib/player-performance";
import { type MatchFormat } from "@/lib/matches/validation";
import { type ActiveMatchDraftGameInput } from "@/lib/matches/drafts";
import {
  buildMatchViews,
  type MatchReadRows,
  type MatchView,
} from "@/lib/matches/read-model";
import { rankGroupListPlayers } from "@/lib/player-rankings";
import {
  encodeMatchHistoryCursor,
  normalizeMatchHistoryRequest,
  type MatchHistoryPage,
  type MatchHistoryRequestInput,
  type NormalizedMatchHistoryRequest,
} from "@/lib/matches/history-pagination";

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
  role: "Creator" | "Participant";
};

export type AppActiveMatchDraftDetail = AppActiveMatchDraft & {
  canEdit: boolean;
  initialMatch: {
    format: MatchFormat;
    teamAUserIds: string[];
    teamBUserIds: string[];
    games: ActiveMatchDraftGameInput[];
  };
};

export type AppPlayer = {
  id: string;
  name: string;
  initials: string;
  role: "Owner" | "Admin" | "Member" | "Guest";
  rating: number;
  rd: number;
  performanceSd: number;
  rank: number;
  gamesPlayed: number;
  status: "Active" | "Inactive";
  isGuest?: boolean;
};

export type AppCurrentRanking = {
  groupId: string;
  playerId: string;
  groupName: string;
  rating: number;
  rd: number;
  rank: number;
  memberCount: number;
};

type GroupRow = {
  id: string;
  name: string;
  description: string;
};

type GroupListRow = GroupRow & {
  member_count: number | string;
};

type MembershipRow = {
  group_id: string;
  role: "owner" | "admin" | "member";
  user_id: string;
};

type RatingRow = {
  user_id: string;
  rating: number | string;
  rd: number | string;
  games_played: number;
  consistency_log_mean?: number | string | null;
};

type GroupMemberSnapshotRow = MembershipRow & {
  display_name: string | null;
  is_guest: boolean;
  active_until: string | null;
  rating: RatingRow["rating"] | null;
  rd: RatingRow["rd"] | null;
  games_played: number | null;
  consistency_log_mean: number | string | null;
};

type GroupMemberSnapshot = {
  group: GroupRow;
  memberships: GroupMemberSnapshotRow[];
};

type MatchHistoryBundle = Omit<MatchReadRows, "currentUserId" | "currentUserAdminGroupIds"> & {
  actorUserId: string;
  currentUserAdminGroupIds: string[];
};

const getCurrentUserId = cache(requireUserId);
const canCurrentUserReadGroupCached = cache(async (groupId: string) => {
  if (!isUuid(groupId)) return false;
  const userId = await requireUserId();
  return canReadGroup(groupId, userId, createSupabaseServiceClient());
});
const getGroupMemberSnapshotCached = cache(async (groupId: string): Promise<GroupMemberSnapshot | null> => {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("get_group_member_snapshot_v2", { p_group_id: groupId });
  if (error) {
    if ((error as { code?: string }).code === "MR403") {
      throw new Error("You are not an active member of this group.");
    }
    throw error;
  }
  if (data === null) return null;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("get_group_member_snapshot_v2 returned an invalid payload");
  }
  return data as GroupMemberSnapshot;
});

export type AppMatchSummary = MatchView;
export type AppMatchDetail = MatchView;

export type AppRatingRebuildStatusValue = "queued" | "running" | "completed" | "failed" | null;
export type AppRatingRebuildStatus = {
  id: string | null;
  status: AppRatingRebuildStatusValue;
};

export async function getGroupRatingRebuildStatus(groupId: string): Promise<AppRatingRebuildStatus> {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("get_rating_rebuild_status", { p_group_id: groupId });
  if (error) throw error;
  const status = data as Partial<AppRatingRebuildStatus> | null;
  return {
    id: status?.id ?? null,
    status: status?.status ?? null,
  };
}

export async function listCurrentUserGroups(): Promise<AppGroup[]> {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("list_current_user_groups_v2", {});
  if (error) throw error;
  return ((data ?? []) as GroupListRow[]).map((group) => ({
    id: group.id,
    name: group.name,
    description: group.description,
    memberCount: Number(group.member_count),
  }));
}

export async function hasOtherCurrentUserGroup(currentGroupId: string): Promise<boolean> {
  if (!isUuid(currentGroupId)) return false;
  const userId = await getCurrentUserId();
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("groups")
    .select("id, group_memberships!inner(user_id)")
    .neq("id", currentGroupId.toLowerCase())
    .is("archived_at", null)
    .eq("group_memberships.user_id", userId)
    .eq("group_memberships.status", "active")
    .is("group_memberships.left_at", null)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

export async function getGroup(groupId: string): Promise<AppGroup | null> {
  const snapshot = await getAuthorizedGroupMemberSnapshot(groupId);
  if (!snapshot) return null;

  return {
    id: snapshot.group.id,
    name: snapshot.group.name,
    description: snapshot.group.description,
    memberCount: snapshot.memberships.length,
  };
}

const MATCH_HISTORY_PAGE_SIZE = 20;

export async function listMatchHistoryPage(input: MatchHistoryRequestInput = {}): Promise<MatchHistoryPage> {
  const request = normalizeMatchHistoryRequest(input);
  const bundle = await queryMatchHistoryBundle({ ...request, limit: MATCH_HISTORY_PAGE_SIZE + 1 });
  const hasNextPage = bundle.matches.length > MATCH_HISTORY_PAGE_SIZE;
  const pageRows = bundle.matches.slice(0, MATCH_HISTORY_PAGE_SIZE);
  const matches = buildHistoryMatchViews({ ...bundle, matches: pageRows });
  const lastRow = pageRows.at(-1);

  return {
    matches,
    nextCursor: hasNextPage && lastRow
      ? encodeMatchHistoryCursor({ submittedAt: lastRow.submitted_at, id: lastRow.id })
      : null,
  };
}

async function queryMatchHistoryBundle({
  groupId = null,
  playerId = null,
  status = null,
  search = null,
  cursor = null,
  limit,
}: Partial<NormalizedMatchHistoryRequest> & { limit: number }): Promise<MatchHistoryBundle> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 51) {
    throw new Error("Match history limit must be between 1 and 51");
  }
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("list_match_history_bundle_v2", {
    p_group_id: groupId,
    p_player_id: playerId,
    p_status: status,
    p_search: search,
    p_before_submitted_at: cursor?.submittedAt ?? null,
    p_before_match_id: cursor?.id ?? null,
    p_limit: limit,
  });
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("list_match_history_bundle_v2 returned an invalid payload");
  }
  return data as MatchHistoryBundle;
}

function buildHistoryMatchViews(bundle: MatchHistoryBundle) {
  return buildMatchViews({
    currentUserId: bundle.actorUserId,
    currentUserAdminGroupIds: bundle.currentUserAdminGroupIds ?? [],
    groups: bundle.groups ?? [],
    matches: bundle.matches ?? [],
    revisions: bundle.revisions ?? [],
    participants: bundle.participants ?? [],
    games: bundle.games ?? [],
    ratingEvents: bundle.ratingEvents ?? [],
    profiles: bundle.profiles ?? [],
  });
}

export async function getGroupMatchDetail(groupId: string, matchId: string): Promise<AppMatchDetail | null> {
  const userId = await getCurrentUserId();
  const service = createSupabaseServiceClient();
  if (!isUuid(groupId) || !isUuid(matchId) || !(await canReadGroup(groupId, userId, service))) return null;

  const { data, error } = await service
    .from("matches")
    .select("id, group_id, active_revision_id, status, submitted_at, review_started_at")
    .eq("group_id", groupId)
    .eq("id", matchId)
    .not("active_revision_id", "is", null)
    .maybeSingle();
  if (error) throw error;
  const row = data as MatchReadRows["matches"][number] | null;
  if (!row || row.id !== matchId || row.group_id !== groupId) return null;
  return (await loadMatchViewsFromTables([row], userId, service))[0] ?? null;
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

async function loadMatchViewsFromTables(
  matches: MatchReadRows["matches"],
  currentUserId: string,
  service: ReturnType<typeof createSupabaseServiceClient>,
) {
  if (!matches.length) return [];
  const groupIds = [...new Set(matches.map((match) => match.group_id))];
  const revisionIds = [...new Set(matches.map((match) => match.active_revision_id))];
  const [groupsResult, membershipsResult, revisionsResult, participantsResult, gamesResult, ratingEventsResult] = await Promise.all([
    service.from("groups").select("id, name").in("id", groupIds),
    service
      .from("group_memberships")
      .select("group_id, role")
      .in("group_id", groupIds)
      .eq("user_id", currentUserId)
      .eq("status", "active")
      .is("left_at", null),
    service.from("match_revisions").select("id, match_id, submitted_by_user_id, format").in("id", revisionIds),
    service.from("match_participants").select("revision_id, user_id, team, slot").in("revision_id", revisionIds),
    service.from("match_games").select("revision_id, game_number, team_a_score, team_b_score, winner_team").in("revision_id", revisionIds),
    service.from("rating_events").select("revision_id, user_id, sequence, before_rating, before_rd, after_rating, after_rd").in("revision_id", revisionIds),
  ]);
  const firstError = [groupsResult, membershipsResult, revisionsResult, participantsResult, gamesResult, ratingEventsResult]
    .find((result) => result.error)?.error;
  if (firstError) throw firstError;

  const participants = (participantsResult.data ?? []) as MatchReadRows["participants"];
  const playerIds = [...new Set(participants.map((participant) => participant.user_id))];
  const profilesResult = await service.from("profiles").select("id, display_name").in("id", playerIds);
  if (profilesResult.error) throw profilesResult.error;

  return buildMatchViews({
    currentUserId,
    currentUserAdminGroupIds: ((membershipsResult.data ?? []) as Array<{ group_id: string; role: MembershipRow["role"] }>)
      .filter((membership) => membership.role !== "member")
      .map((membership) => membership.group_id),
    matches,
    groups: (groupsResult.data ?? []) as MatchReadRows["groups"],
    revisions: (revisionsResult.data ?? []) as MatchReadRows["revisions"],
    participants,
    games: (gamesResult.data ?? []) as MatchReadRows["games"],
    ratingEvents: (ratingEventsResult.data ?? []) as MatchReadRows["ratingEvents"],
    profiles: (profilesResult.data ?? []) as MatchReadRows["profiles"],
  });
}


export async function listGroupPlayers(groupId: string): Promise<AppPlayer[]> {
  const snapshot = await getAuthorizedGroupMemberSnapshot(groupId);
  if (!snapshot) return [];

  const players = snapshot.memberships.map((membership) => {
    const name = membership.display_name ?? "Unknown player";

    return {
      id: membership.user_id,
      name,
      initials: initialsFor(name),
      role: membership.is_guest ? "Guest" : displayRole(membership.role),
      rating: Math.round(Number(membership.rating ?? 1500)),
      rd: Number(membership.rd ?? 350),
      performanceSd: performanceSdFromLogMean(membership.consistency_log_mean),
      gamesPlayed: membership.games_played ?? 0,
      status:
        membership.active_until && new Date(membership.active_until).getTime() >= Date.now()
          ? "Active"
          : "Inactive",
      isGuest: membership.is_guest,
    } satisfies Omit<AppPlayer, "rank">;
  });

  return rankGroupListPlayers(players);
}

async function getAuthorizedGroupMemberSnapshot(groupId: string) {
  if (!isUuid(groupId)) {
    throw new Error("You are not an active member of this group.");
  }
  return getGroupMemberSnapshotCached(groupId.toLowerCase());
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

