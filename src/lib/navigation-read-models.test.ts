import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  getGroupPageData,
  getHomePageData,
  getMatchRecorderPageData,
} from "@/lib/navigation-read-models";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

const actorId = "11111111-1111-4111-8111-111111111111";
const groupId = "22222222-2222-4222-8222-222222222222";
const opponentId = "33333333-3333-4333-8333-333333333333";
const matchId = "44444444-4444-4444-8444-444444444444";
const revisionId = "55555555-5555-4555-8555-555555555555";
const draftId = "66666666-6666-4666-8666-666666666666";

const memberships = [
  {
    group_id: groupId,
    user_id: actorId,
    role: "owner",
    display_name: "Alice Tan",
    is_guest: false,
    active_until: "2099-08-13T12:00:00.000Z",
  },
  {
    group_id: groupId,
    user_id: opponentId,
    role: "member",
    display_name: "Bea Rivera",
    is_guest: false,
    active_until: null,
  },
];

const ratings = [
  { group_id: groupId, user_id: actorId, rating: "1642.4", rd: "71.6", games_played: 18 },
  { group_id: groupId, user_id: opponentId, rating: "1510.2", rd: "88.1", games_played: 9 },
];

const draft = {
  id: draftId,
  group_id: groupId,
  created_by_user_id: actorId,
  format: "singles",
  team_a_user_ids: [actorId],
  team_b_user_ids: [opponentId],
  games: [{ teamAScore: 21, teamBScore: 18, winnerTeam: "A" }],
  expires_at: "2099-08-14T12:00:00.000Z",
};

const matchBundle = {
  groups: [{ id: groupId, name: "Wednesday Club" }],
  matches: [{
    id: matchId,
    group_id: groupId,
    active_revision_id: revisionId,
    status: "confirmed",
    submitted_at: "2026-08-13T12:00:00.000Z",
    review_started_at: "2026-08-13T12:00:00.000Z",
  }],
  revisions: [{ id: revisionId, match_id: matchId, submitted_by_user_id: actorId, format: "singles" }],
  participants: [
    { revision_id: revisionId, user_id: actorId, team: "A", slot: 1 },
    { revision_id: revisionId, user_id: opponentId, team: "B", slot: 1 },
  ],
  games: [{ revision_id: revisionId, game_number: 1, team_a_score: 21, team_b_score: 18, winner_team: "A" }],
  confirmations: [],
  ratingEvents: [],
  profiles: [
    { id: actorId, display_name: "Alice Tan" },
    { id: opponentId, display_name: "Bea Rivera" },
  ],
};

describe("navigation read models", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSupabaseServerClient.mockResolvedValue({ rpc: mocks.rpc });
  });

  test("hydrates the complete home model from one bounded RPC", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        actorUserId: actorId,
        profile: { id: actorId, display_name: "Alice Tan" },
        groups: [{ id: groupId, name: "Wednesday Club", description: "Weekly ladder" }],
        memberships,
        ratings,
        drafts: [draft],
        profiles: [
          { id: actorId, display_name: "Alice Tan" },
          { id: opponentId, display_name: "Bea Rivera" },
        ],
        matchBundle,
      },
      error: null,
    });

    const result = await getHomePageData();

    expect(result.profile).toEqual({ id: actorId, name: "Alice Tan", initials: "AT" });
    expect(result.groups).toEqual([{ id: groupId, name: "Wednesday Club", description: "Weekly ladder", memberCount: 2 }]);
    expect(result.activeDrafts[0]).toMatchObject({
      id: draftId,
      teamA: ["Alice Tan"],
      teamB: ["Bea Rivera"],
      scores: ["21-18"],
      role: "Creator",
    });
    expect(result.currentRankings).toEqual([{ groupId, playerId: actorId, groupName: "Wednesday Club", rating: 1642, rank: 1, memberCount: 2 }]);
    expect(result.latestMatches).toHaveLength(1);
    expect(result.latestMatches[0]).toMatchObject({ id: matchId, groupName: "Wednesday Club" });
    expect(mocks.rpc.mock.calls).toEqual([["get_home_page_data", { p_match_limit: 3 }]]);
  });

  test("hydrates group players, drafts, status, and matches from one RPC", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        actorUserId: actorId,
        group: { id: groupId, name: "Wednesday Club", description: "Weekly ladder" },
        memberships,
        ratings,
        drafts: [draft],
        profiles: [
          { id: actorId, display_name: "Alice Tan" },
          { id: opponentId, display_name: "Bea Rivera" },
        ],
        ratingStatus: { id: "77777777-7777-4777-8777-777777777777", status: "failed", canRetry: true },
        matchBundle,
      },
      error: null,
    });

    const result = await getGroupPageData(groupId);

    expect(result?.group.memberCount).toBe(2);
    expect(result?.players.map(({ name, rank, role }) => ({ name, rank, role }))).toEqual([
      { name: "Alice Tan", rank: 1, role: "Owner" },
      { name: "Bea Rivera", rank: 2, role: "Member" },
    ]);
    expect(result?.ratingStatus).toEqual({ id: "77777777-7777-4777-8777-777777777777", status: "failed", canRetry: true });
    expect(result?.activeDrafts).toHaveLength(1);
    expect(result?.recentMatches).toHaveLength(1);
    expect(mocks.rpc.mock.calls).toEqual([["get_group_page_data", { p_group_id: groupId, p_match_limit: 5 }]]);
  });

  test("summarizes partial draft teams and scores without inventing zeroes", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        actorUserId: actorId,
        profile: { id: actorId, display_name: "Alice Tan" },
        groups: [{ id: groupId, name: "Wednesday Club", description: "Weekly ladder" }],
        memberships,
        ratings,
        drafts: [{
          ...draft,
          format: "doubles",
          team_a_user_ids: [actorId],
          team_b_user_ids: [],
          games: [
            { teamAScore: 21, teamBScore: null, winnerTeam: "A" },
            { teamAScore: null, teamBScore: null, winnerTeam: "B" },
          ],
        }],
        profiles: [{ id: actorId, display_name: "Alice Tan" }],
        matchBundle,
      },
      error: null,
    });

    const result = await getHomePageData();

    expect(result.activeDrafts[0]).toMatchObject({
      teamA: ["Alice Tan", "Open slot"],
      teamB: ["Open slot", "Open slot"],
      scores: ["21-?"],
    });
  });

  test("hydrates nullable scores for an incomplete recorder draft", async () => {
    const partialDraft = {
      ...draft,
      team_b_user_ids: [],
      games: [{ teamAScore: null, teamBScore: 18, winnerTeam: "B" }],
    };
    mocks.rpc.mockResolvedValue({
      data: {
        actorUserId: actorId,
        group: { id: groupId, name: "Wednesday Club", description: "Weekly ladder" },
        groups: [{ id: groupId, name: "Wednesday Club", description: "Weekly ladder" }],
        memberships,
        ratings,
        draft: partialDraft,
        profiles: [
          { id: actorId, display_name: "Alice Tan" },
          { id: opponentId, display_name: "Bea Rivera" },
        ],
        ratingStatus: { id: null, status: null, canRetry: false },
      },
      error: null,
    });

    const result = await getMatchRecorderPageData(groupId, draftId);

    expect(result?.draft?.initialMatch).toEqual({
      format: "singles",
      teamAUserIds: [actorId],
      teamBUserIds: [],
      games: [{ teamAScore: null, teamBScore: 18, winnerTeam: "B" }],
    });
    expect(result?.draft?.scores).toEqual(["?-18"]);
  });

  test("returns null for malformed or inaccessible groups without leaking a second query", async () => {
    await expect(getGroupPageData("not-a-uuid")).resolves.toBeNull();
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();

    mocks.rpc.mockResolvedValue({ data: null, error: null });
    await expect(getGroupPageData(groupId)).resolves.toBeNull();
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  test("normalizes a malformed draft id to a missing draft in the recorder RPC", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        actorUserId: actorId,
        group: { id: groupId, name: "Wednesday Club", description: "Weekly ladder" },
        groups: [{ id: groupId, name: "Wednesday Club", description: "Weekly ladder" }],
        memberships,
        ratings,
        draft: null,
        profiles: memberships.map(({ user_id: id, display_name }) => ({ id, display_name })),
        ratingStatus: { id: null, status: null, canRetry: false },
      },
      error: null,
    });

    const result = await getMatchRecorderPageData(groupId, "not-a-uuid");

    expect(result?.draft).toBeNull();
    expect(result?.players).toHaveLength(2);
    expect(mocks.rpc.mock.calls).toEqual([[
      "get_match_recorder_page_data",
      { p_group_id: groupId, p_draft_id: null },
    ]]);
  });

  test("propagates RPC failures instead of returning partial page data", async () => {
    const error = new Error("navigation RPC failed");
    mocks.rpc.mockResolvedValue({ data: null, error });

    await expect(getHomePageData()).rejects.toBe(error);
  });
});
