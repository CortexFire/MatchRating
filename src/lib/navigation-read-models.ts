import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  type AppActiveMatchDraft,
  type AppActiveMatchDraftDetail,
  type AppCurrentRanking,
  type AppGroup,
  type AppMatchSummary,
  type AppPlayer,
  type AppProfile,
  type AppRatingRebuildStatus,
} from "@/lib/app-data";
import { buildMatchViews, type MatchReadRows } from "@/lib/matches/read-model";
import { type ActiveMatchDraftGameInput } from "@/lib/matches/drafts";
import { type MatchFormat } from "@/lib/matches/validation";
import { performanceSdFromLogMean } from "@/lib/player-performance";
import { rankGroupListPlayers } from "@/lib/player-rankings";

export type HomePageData = {
  profile: AppProfile;
  groups: AppGroup[];
  activeDrafts: AppActiveMatchDraft[];
  latestMatches: AppMatchSummary[];
  currentRankings: AppCurrentRanking[];
};

export type GroupPageData = {
  group: AppGroup;
  activeDrafts: AppActiveMatchDraft[];
  ratingStatus: AppRatingRebuildStatus;
  ratingHistory: GroupRatingHistoryData;
  recentMatches: AppMatchSummary[];
  players: AppPlayer[];
};

export type GroupRatingHistoryPoint = {
  matchId: string | null;
  occurredAt: string;
  rating: number;
};

export type GroupRatingHistorySeries = {
  playerId: string;
  name: string;
  rank: number;
  currentRating: number;
  points: GroupRatingHistoryPoint[];
};

export type GroupRatingHistoryData = {
  windowStart: string;
  windowEnd: string;
  series: GroupRatingHistorySeries[];
};

export type MatchRecorderPageData = {
  group: AppGroup;
  groups: AppGroup[];
  players: AppPlayer[];
  draft: AppActiveMatchDraftDetail | null;
  ratingStatus: AppRatingRebuildStatus;
};

type RawGroup = {
  id: string;
  name: string;
  description: string;
};

type RawProfile = {
  id: string;
  display_name: string;
};

type RawMembership = {
  group_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  display_name: string | null;
  is_guest: boolean;
  active_until: string | null;
};

type RawRating = {
  group_id: string;
  user_id: string;
  rating: number | string;
  rd: number | string;
  games_played: number;
  consistency_log_mean?: number | string | null;
};

type RawDraft = {
  id: string;
  group_id: string;
  created_by_user_id: string;
  format: MatchFormat;
  team_a_user_ids: string[];
  team_b_user_ids: string[];
  games: unknown;
  expires_at: string;
};

type RawMatchBundle = {
  groups: MatchReadRows["groups"];
  matches: MatchReadRows["matches"];
  revisions: MatchReadRows["revisions"];
  participants: MatchReadRows["participants"];
  games: MatchReadRows["games"];
  ratingEvents: MatchReadRows["ratingEvents"];
  profiles: MatchReadRows["profiles"];
};

type RawBasePayload = {
  actorUserId: string;
  memberships: RawMembership[];
  ratings: RawRating[];
  profiles: RawProfile[];
};

type RawHomePayload = RawBasePayload & {
  profile: RawProfile;
  groups: RawGroup[];
  drafts: RawDraft[];
  matchBundle: RawMatchBundle;
};

type RawGroupPayload = RawBasePayload & {
  group: RawGroup;
  drafts: RawDraft[];
  ratingStatus: Partial<AppRatingRebuildStatus> | null;
  ratingHistory?: RawGroupRatingHistory;
  matchBundle: RawMatchBundle;
};

type RawGroupRatingHistory = {
  windowStart: string;
  windowEnd: string;
  events: RawGroupRatingHistoryEvent[];
};

type RawGroupRatingHistoryEvent = {
  user_id: string;
  match_id: string;
  occurred_at: string;
  before_rating: number | string;
  after_rating: number | string;
};

type RawRecorderPayload = RawBasePayload & {
  group: RawGroup;
  groups: RawGroup[];
  draft: RawDraft | null;
  ratingStatus: Partial<AppRatingRebuildStatus> | null;
};

export async function getHomePageData(): Promise<HomePageData> {
  const raw = requirePayload<RawHomePayload>(
    await callNavigationRpc("get_home_page_data", { p_match_limit: 3 }),
    "get_home_page_data",
  );
  const groups = toGroups(raw.groups, raw.memberships);

  return {
    profile: toProfile(raw.profile),
    groups,
    activeDrafts: toDraftSummaries(raw.drafts, raw.actorUserId, groups, raw.profiles),
    latestMatches: toMatches(raw.matchBundle, raw.actorUserId, raw.memberships).slice(0, 3),
    currentRankings: toCurrentRankings(groups, raw.memberships, raw.ratings, raw.actorUserId),
  };
}

export async function getGroupPageData(groupId: string): Promise<GroupPageData | null> {
  if (!isUuid(groupId)) return null;
  const data = await callNavigationRpc("get_group_page_data", {
    p_group_id: groupId,
    p_match_limit: 5,
  });
  if (data === null) return null;
  const raw = requirePayload<RawGroupPayload>(data, "get_group_page_data");
  if (!raw.group) return null;
  const [group] = toGroups([raw.group], raw.memberships);
  if (!group) return null;
  const players = toPlayers(groupId, raw.memberships, raw.ratings);

  return {
    group,
    activeDrafts: toDraftSummaries(raw.drafts, raw.actorUserId, [group], raw.profiles),
    ratingStatus: toRatingStatus(raw.ratingStatus),
    ratingHistory: toGroupRatingHistory(raw.ratingHistory, players),
    recentMatches: toMatches(raw.matchBundle, raw.actorUserId, raw.memberships).slice(0, 5),
    players,
  };
}

export async function getMatchRecorderPageData(
  groupId: string,
  draftId?: string,
): Promise<MatchRecorderPageData | null> {
  if (!isUuid(groupId)) return null;
  const data = await callNavigationRpc("get_match_recorder_page_data", {
    p_group_id: groupId,
    p_draft_id: draftId && isUuid(draftId) ? draftId : null,
  });
  if (data === null) return null;
  const raw = requirePayload<RawRecorderPayload>(data, "get_match_recorder_page_data");
  if (!raw.group) return null;
  const groups = toGroups(raw.groups, raw.memberships);
  const group = groups.find((candidate) => candidate.id === groupId)
    ?? toGroups([raw.group], raw.memberships)[0];
  if (!group) return null;

  return {
    group,
    groups,
    players: toPlayers(groupId, raw.memberships, raw.ratings),
    draft: raw.draft ? toDraftDetail(raw.draft, raw.actorUserId, groups, raw.profiles) : null,
    ratingStatus: toRatingStatus(raw.ratingStatus),
  };
}

async function callNavigationRpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
}

function requirePayload<T>(data: unknown, rpcName: string): T {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${rpcName} returned an invalid payload`);
  }
  return data as T;
}

function toGroups(groups: RawGroup[], memberships: RawMembership[]): AppGroup[] {
  const memberCounts = new Map<string, number>();
  for (const membership of memberships) {
    memberCounts.set(membership.group_id, (memberCounts.get(membership.group_id) ?? 0) + 1);
  }
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    description: group.description,
    memberCount: memberCounts.get(group.id) ?? 0,
  }));
}

function toPlayers(groupId: string, memberships: RawMembership[], ratings: RawRating[]): AppPlayer[] {
  const ratingsByUserId = new Map(
    ratings.filter((rating) => rating.group_id === groupId).map((rating) => [rating.user_id, rating]),
  );
  return rankGroupListPlayers(
    memberships
      .filter((membership) => membership.group_id === groupId)
      .map((membership) => {
        const rating = ratingsByUserId.get(membership.user_id);
        const name = membership.display_name ?? "Unknown player";
        return {
          id: membership.user_id,
          name,
          initials: initialsFor(name),
          role: membership.is_guest ? "Guest" : displayRole(membership.role),
          rating: Math.round(Number(rating?.rating ?? 1500)),
          rd: Number(rating?.rd ?? 350),
          performanceSd: performanceSdFromLogMean(rating?.consistency_log_mean),
          gamesPlayed: rating?.games_played ?? 0,
          status: membership.active_until && new Date(membership.active_until).getTime() >= Date.now()
            ? "Active"
            : "Inactive",
          isGuest: membership.is_guest,
        } satisfies Omit<AppPlayer, "rank">;
      }),
  );
}

function toCurrentRankings(
  groups: AppGroup[],
  memberships: RawMembership[],
  ratings: RawRating[],
  actorUserId: string,
): AppCurrentRanking[] {
  return groups
    .flatMap((group) => {
      const ranked = toPlayers(group.id, memberships, ratings);
      const rankedPlayers = ranked.filter((player) => player.rank > 0);
      const current = rankedPlayers.find((player) => player.id === actorUserId);
      return current ? [{
        groupId: group.id,
        playerId: actorUserId,
        groupName: group.name,
        rating: current.rating,
        rd: current.rd,
        rank: current.rank,
        memberCount: rankedPlayers.length,
      }] : [];
    })
    .sort((left, right) => left.groupName.localeCompare(right.groupName) || left.groupId.localeCompare(right.groupId));
}

function toDraftSummaries(
  drafts: RawDraft[],
  actorUserId: string,
  groups: AppGroup[],
  profiles: RawProfile[],
): AppActiveMatchDraft[] {
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  const profileNames = new Map(profiles.map((profile) => [profile.id, profile.display_name]));
  return drafts.map((draft) => {
    const scores = parseDraftGames(draft.games).flatMap((game) => {
      if (game.teamAScore === null && game.teamBScore === null) return [];
      return [`${game.teamAScore ?? "?"}-${game.teamBScore ?? "?"}`];
    });
    return {
      id: draft.id,
      groupId: draft.group_id,
      groupName: groupNames.get(draft.group_id) ?? "Group",
      format: draft.format,
      teamA: toDraftTeamNames(draft.team_a_user_ids, draft.format, profileNames),
      teamB: toDraftTeamNames(draft.team_b_user_ids, draft.format, profileNames),
      scores: scores.length ? scores : ["Score pending"],
      role: draft.created_by_user_id === actorUserId ? "Creator" : "Participant",
    };
  });
}

function toDraftTeamNames(
  playerIds: string[],
  format: MatchFormat,
  profileNames: Map<string, string>,
) {
  const expectedSize = format === "singles" ? 1 : 2;
  const names = playerIds.map((id) => profileNames.get(id) ?? "Unknown player");
  return [...names, ...Array.from({ length: expectedSize - names.length }, () => "Open slot")];
}

function toDraftDetail(
  draft: RawDraft,
  actorUserId: string,
  groups: AppGroup[],
  profiles: RawProfile[],
): AppActiveMatchDraftDetail {
  const summary = toDraftSummaries([draft], actorUserId, groups, profiles)[0];
  return {
    ...summary,
    canEdit: true,
    initialMatch: {
      format: draft.format,
      teamAUserIds: draft.team_a_user_ids,
      teamBUserIds: draft.team_b_user_ids,
      games: parseDraftGames(draft.games),
    },
  };
}

function toMatches(
  bundle: RawMatchBundle,
  actorUserId: string,
  memberships: RawMembership[],
): AppMatchSummary[] {
  return buildMatchViews({
    currentUserId: actorUserId,
    currentUserAdminGroupIds: memberships
      .filter((membership) => membership.user_id === actorUserId && membership.role !== "member")
      .map((membership) => membership.group_id),
    groups: bundle.groups ?? [],
    matches: bundle.matches ?? [],
    revisions: bundle.revisions ?? [],
    participants: bundle.participants ?? [],
    games: bundle.games ?? [],
    ratingEvents: bundle.ratingEvents ?? [],
    profiles: bundle.profiles ?? [],
  });
}

function toRatingStatus(status: Partial<AppRatingRebuildStatus> | null): AppRatingRebuildStatus {
  return {
    id: status?.id ?? null,
    status: status?.status ?? null,
    canRetry: status?.canRetry === true,
  };
}

function toGroupRatingHistory(
  history: RawGroupRatingHistory | undefined,
  players: AppPlayer[],
): GroupRatingHistoryData {
  if (!history) return { windowStart: "", windowEnd: "", series: [] };

  const windowStartMs = Date.parse(history.windowStart);
  const windowEndMs = Date.parse(history.windowEnd);
  const rankedPlayers = players.filter((player) => player.rank > 0).slice(0, 10);

  return {
    windowStart: history.windowStart,
    windowEnd: history.windowEnd,
    series: rankedPlayers.map((player) => {
      const events = history.events
        .filter((event) => event.user_id === player.id)
        .sort((left, right) => Date.parse(left.occurred_at) - Date.parse(right.occurred_at)
          || left.match_id.localeCompare(right.match_id));
      const priorEvent = events.filter((event) => Date.parse(event.occurred_at) < windowStartMs).at(-1);
      const inWindowEvents = events.filter((event) => {
        const occurredAt = Date.parse(event.occurred_at);
        return occurredAt >= windowStartMs && occurredAt <= windowEndMs;
      });
      const boundaryRating = Math.round(Number(
        priorEvent?.after_rating ?? inWindowEvents[0]?.before_rating ?? player.rating,
      ));

      return {
        playerId: player.id,
        name: player.name,
        rank: player.rank,
        currentRating: player.rating,
        points: [
          { matchId: null, occurredAt: history.windowStart, rating: boundaryRating },
          ...inWindowEvents.map((event) => ({
            matchId: event.match_id,
            occurredAt: event.occurred_at,
            rating: Math.round(Number(event.after_rating)),
          })),
          { matchId: null, occurredAt: history.windowEnd, rating: player.rating },
        ],
      };
    }),
  };
}

function toProfile(profile: RawProfile): AppProfile {
  return { id: profile.id, name: profile.display_name, initials: initialsFor(profile.display_name) };
}

function parseDraftGames(value: unknown): ActiveMatchDraftGameInput[] {
  if (!Array.isArray(value)) return [{ teamAScore: null, teamBScore: null, winnerTeam: "A" }];
  return value.flatMap((stored): ActiveMatchDraftGameInput[] => {
    if (!stored || typeof stored !== "object") return [];
    const game = stored as { teamAScore?: unknown; teamBScore?: unknown; winnerTeam?: unknown };
    const teamAScore = game.teamAScore === null || game.teamAScore === undefined
      ? null
      : Number(game.teamAScore);
    const teamBScore = game.teamBScore === null || game.teamBScore === undefined
      ? null
      : Number(game.teamBScore);
    if (
      (teamAScore !== null && !Number.isFinite(teamAScore)) ||
      (teamBScore !== null && !Number.isFinite(teamBScore))
    ) return [];
    return [{
      teamAScore,
      teamBScore,
      winnerTeam: game.winnerTeam === "A" || game.winnerTeam === "B"
        ? game.winnerTeam
        : teamAScore !== null && teamBScore !== null && teamBScore > teamAScore ? "B" : "A",
    }];
  });
}

function displayRole(role: RawMembership["role"]): AppPlayer["role"] {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Member";
}

function initialsFor(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
