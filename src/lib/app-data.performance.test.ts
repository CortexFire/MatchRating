import { beforeEach, describe, expect, test, vi } from "vitest";

const reactMocks = vi.hoisted(() => ({
  values: new Map<unknown, Map<string, unknown>>(),
  cache: vi.fn((fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => {
    let values = reactMocks.values.get(fn);
    if (!values) {
      values = new Map();
      reactMocks.values.set(fn, values);
    }
    const key = JSON.stringify(args);
    if (!values.has(key)) values.set(key, fn(...args));
    return values.get(key);
  }),
}));

const supabaseMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
  requireUserId: vi.fn(),
}));

vi.mock("react", () => reactMocks);
vi.mock("@/lib/supabase/server", () => supabaseMocks);

import { getGroup, listCurrentUserGroups, listGroupPlayers, listMatchHistoryPage } from "./app-data";

const GROUP_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const PLAYER_ID = "22222222-2222-4222-8222-222222222222";

describe("performance read contracts", () => {
  let rpc: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    reactMocks.values.clear();
    supabaseMocks.requireUserId.mockResolvedValue(ACTOR_ID);
    rpc = vi.fn();
    supabaseMocks.createSupabaseServerClient.mockResolvedValue({ rpc });
    supabaseMocks.createSupabaseServiceClient.mockReturnValue({
      rpc,
      from: vi.fn(() => {
        throw new Error("performance reads must not issue follow-up table queries");
      }),
    });
  });

  test("lists group metadata and SQL member counts in one RPC", async () => {
    rpc.mockResolvedValue({
      data: [{ id: GROUP_ID, name: "Wednesday Club", description: "", member_count: 2 }],
      error: null,
    });

    await expect(listCurrentUserGroups()).resolves.toEqual([{
      id: GROUP_ID,
      name: "Wednesday Club",
      description: "",
      memberCount: 2,
    }]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("list_current_user_groups_v2", {});
  });

  test("shares one scalar-keyed group snapshot between metadata and player readers", async () => {
    rpc.mockResolvedValue({
      data: {
        group: { id: GROUP_ID, name: "Wednesday Club", description: "" },
        memberships: [
          {
            group_id: GROUP_ID,
            user_id: ACTOR_ID,
            role: "owner",
            display_name: "Alice Owner",
            is_guest: false,
            active_until: null,
            rating: 1700,
            rd: 80,
            games_played: 5,
            consistency_log_mean: null,
          },
          {
            group_id: GROUP_ID,
            user_id: PLAYER_ID,
            role: "member",
            display_name: "Bea Player",
            is_guest: false,
            active_until: null,
            rating: 1500,
            rd: 350,
            games_played: 0,
            consistency_log_mean: null,
          },
        ],
      },
      error: null,
    });

    const [group, players] = await Promise.all([
      getGroup(GROUP_ID),
      listGroupPlayers(`${GROUP_ID}`),
    ]);

    expect(group).toEqual({ id: GROUP_ID, name: "Wednesday Club", description: "", memberCount: 2 });
    expect(players.map(({ id, rank }) => ({ id, rank }))).toEqual([
      { id: ACTOR_ID, rank: 1 },
      { id: PLAYER_ID, rank: 0 },
    ]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_group_member_snapshot_v2", { p_group_id: GROUP_ID });
  });

  test("loads a complete cursor page and its rating data in one RPC", async () => {
    const matches = Array.from({ length: 21 }, (_, index) => {
      const suffix = String(index + 1).padStart(12, "0");
      return {
        id: `90000000-0000-4000-8000-${suffix}`,
        group_id: GROUP_ID,
        active_revision_id: `91000000-0000-4000-8000-${suffix}`,
        status: "confirmed" as const,
        submitted_at: `2026-08-${String(31 - index).padStart(2, "0")}T12:00:00.000Z`,
        review_started_at: `2026-08-${String(31 - index).padStart(2, "0")}T12:00:00.000Z`,
      };
    });
    rpc.mockResolvedValue({
      data: {
        actorUserId: ACTOR_ID,
        currentUserAdminGroupIds: [GROUP_ID],
        groups: [{ id: GROUP_ID, name: "Wednesday Club" }],
        matches,
        revisions: matches.map((match) => ({
          id: match.active_revision_id,
          match_id: match.id,
          submitted_by_user_id: ACTOR_ID,
          format: "singles",
        })),
        participants: matches.flatMap((match) => [
          { revision_id: match.active_revision_id, user_id: ACTOR_ID, team: "A", slot: 1 },
          { revision_id: match.active_revision_id, user_id: PLAYER_ID, team: "B", slot: 1 },
        ]),
        games: matches.map((match) => ({
          revision_id: match.active_revision_id,
          game_number: 1,
          team_a_score: 21,
          team_b_score: 18,
          winner_team: "A",
        })),
        ratingEvents: [{
          revision_id: matches[0].active_revision_id,
          user_id: ACTOR_ID,
          sequence: 1,
          before_rating: 1500,
          before_rd: 350,
          after_rating: 1512,
          after_rd: 280,
        }],
        profiles: [
          { id: ACTOR_ID, display_name: "Alice Owner" },
          { id: PLAYER_ID, display_name: "Bea Player" },
        ],
      },
      error: null,
    });

    const page = await listMatchHistoryPage({ groupId: GROUP_ID, status: "confirmed" });

    expect(page.matches).toHaveLength(20);
    expect(page.matches[0].teamA[0].ratingChange).toEqual({
      previous: { rating: 1500, rd: 350 },
      next: { rating: 1512, rd: 280 },
    });
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("list_match_history_bundle_v2", {
      p_group_id: GROUP_ID,
      p_player_id: null,
      p_status: "confirmed",
      p_search: null,
      p_before_submitted_at: null,
      p_before_match_id: null,
      p_limit: 21,
    });
  });
});
