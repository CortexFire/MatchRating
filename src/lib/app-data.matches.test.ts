import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  canCurrentUserReadGroup,
  getActiveMatchDraft,
  getGroup,
  getGroupMatchDetail,
  listCurrentUserMatches,
  listCurrentUserRankings,
  listCurrentUserActiveMatchDrafts,
  listGroupActiveMatchDrafts,
  listGroupMatches,
  listGroupPlayers,
  listPendingReviewsForCurrentUser,
} from "./app-data";

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

vi.mock("@/lib/supabase/server", () => supabaseMocks);
vi.mock("react", () => reactMocks);

const GROUP_ONE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GROUP_TWO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MATCH_NEW = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MATCH_OLD = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const MATCH_OTHER = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const REVISION_NEW = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const REVISION_OLD = "10101010-1010-4010-8010-101010101010";
const REVISION_OTHER = "20202020-2020-4020-8020-202020202020";
const SUBMITTER = "11111111-1111-4111-8111-111111111111";
const OPPONENT = "22222222-2222-4222-8222-222222222222";

const baseRows: Record<string, unknown[]> = {
  group_memberships: [{ id: "membership-1", group_id: GROUP_ONE, user_id: OPPONENT, status: "active", left_at: null }],
  groups: [{ id: GROUP_ONE, name: "Wednesday Club" }, { id: GROUP_TWO, name: "Other Club" }],
  matches: [
    { id: MATCH_OLD, group_id: GROUP_ONE, active_revision_id: REVISION_OLD, status: "pending_confirmation", submitted_at: "2026-08-06T20:00:00.000Z", review_started_at: "2026-08-06T20:00:00.000Z" },
    { id: MATCH_OTHER, group_id: GROUP_TWO, active_revision_id: REVISION_OTHER, status: "pending_confirmation", submitted_at: "2026-08-08T20:00:00.000Z", review_started_at: "2026-08-08T20:00:00.000Z" },
    { id: MATCH_NEW, group_id: GROUP_ONE, active_revision_id: REVISION_NEW, status: "pending_confirmation", submitted_at: "2026-08-07T20:00:00.000Z", review_started_at: "2026-08-07T20:00:00.000Z" },
  ],
  match_revisions: [
    { id: REVISION_NEW, match_id: MATCH_NEW, submitted_by_user_id: SUBMITTER, format: "singles" },
    { id: REVISION_OLD, match_id: MATCH_OLD, submitted_by_user_id: SUBMITTER, format: "singles" },
    { id: REVISION_OTHER, match_id: MATCH_OTHER, submitted_by_user_id: SUBMITTER, format: "singles" },
  ],
  match_participants: [
    ...[REVISION_NEW, REVISION_OLD, REVISION_OTHER].flatMap((revisionId) => [
      { revision_id: revisionId, user_id: SUBMITTER, team: "A", slot: 1 },
      { revision_id: revisionId, user_id: OPPONENT, team: "B", slot: 1 },
    ]),
  ],
  match_games: [
    ...[REVISION_NEW, REVISION_OLD, REVISION_OTHER].map((revisionId) => ({
      revision_id: revisionId, game_number: 1, team_a_score: 21, team_b_score: 18, winner_team: "A",
    })),
  ],
  match_confirmations: [{ revision_id: REVISION_OLD, user_id: OPPONENT, action: "confirmed", created_at: "2026-08-06T21:00:00.000Z" }],
  rating_events: [],
  profiles: [{ id: SUBMITTER, display_name: "Alice Tan" }, { id: OPPONENT, display_name: "Bea Rivera" }],
  active_match_drafts: [{
    id: "30303030-3030-4030-8030-303030303030",
    group_id: GROUP_ONE,
    created_by_user_id: SUBMITTER,
    format: "singles",
    team_a_user_ids: [SUBMITTER],
    team_b_user_ids: [OPPONENT],
    games: [{ teamAScore: 12, teamBScore: 12, winnerTeam: "B" }],
    expires_at: "2099-01-01T00:00:00.000Z",
    submitted_match_id: null,
  }],
};

let rowsByTable: Record<string, unknown[]>;
let from: ReturnType<typeof vi.fn>;
let queriesByTable: Record<string, Array<ReturnType<typeof makeQuery>>>;

function makeQuery(table: string) {
  let rows = rowsByTable[table] ?? [];
  const orders: Array<{ column: string; ascending: boolean }> = [];
  let rowLimit: number | undefined;
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      rows = rows.filter((row) => (row as Record<string, unknown>)[column] === value);
      return query;
    }),
    in: vi.fn((column: string, values: unknown[]) => {
      rows = rows.filter((row) => values.includes((row as Record<string, unknown>)[column]));
      return query;
    }),
    is: vi.fn((column: string, value: unknown) => {
      rows = rows.filter((row) => ((row as Record<string, unknown>)[column] ?? null) === value);
      return query;
    }),
    not: vi.fn((column: string, operator: string, value: unknown) => {
      if (operator === "is") rows = rows.filter((row) => ((row as Record<string, unknown>)[column] ?? null) !== value);
      return query;
    }),
    delete: vi.fn(() => query),
    lt: vi.fn(() => query),
    gt: vi.fn(() => query),
    or: vi.fn(() => query),
    order: vi.fn((column: string, options: { ascending: boolean }) => {
      orders.push({ column, ascending: options.ascending });
      return query;
    }),
    limit: vi.fn((value: number) => {
      rowLimit = value;
      return query;
    }),
    maybeSingle: vi.fn(async () => ({ data: materialize()[0] ?? null, error: null })),
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => resolve({ data: materialize(), error: null }),
  };

  function materialize() {
    const sorted = [...rows].sort((left, right) => {
      for (const order of orders) {
        const leftValue = String((left as Record<string, unknown>)[order.column] ?? "");
        const rightValue = String((right as Record<string, unknown>)[order.column] ?? "");
        const comparison = leftValue.localeCompare(rightValue);
        if (comparison) return order.ascending ? comparison : -comparison;
      }
      return 0;
    });
    return rowLimit === undefined ? sorted : sorted.slice(0, rowLimit);
  }

  return query;
}

describe("stored match reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reactMocks.values.clear();
    rowsByTable = structuredClone(baseRows);
    queriesByTable = {};
    from = vi.fn((table: string) => {
      const query = makeQuery(table);
      (queriesByTable[table] ??= []).push(query);
      return query;
    });
    supabaseMocks.requireUserId.mockResolvedValue(OPPONENT);
    supabaseMocks.createSupabaseServiceClient.mockReturnValue({ from });
  });

  test("orders one group's hydrated matches newest first", async () => {
    const matches = await listGroupMatches(GROUP_ONE);

    expect(matches.map((match) => match.id)).toEqual([MATCH_NEW, MATCH_OLD]);
    expect(matches.every((match) => match.groupId === GROUP_ONE)).toBe(true);
  });

  test("limits the constrained newest-first match rows before hydration", async () => {
    rowsByTable.matches = [
      { id: "99999999-9999-4999-8999-999999999999", group_id: GROUP_ONE, active_revision_id: null, status: "confirmed", submitted_at: "2026-08-09T20:00:00.000Z", review_started_at: "2026-08-09T20:00:00.000Z" },
      ...rowsByTable.matches,
    ];

    await listGroupMatches(GROUP_ONE, { limit: 5 });

    const matchesQuery = queriesByTable.matches[0];
    expect(matchesQuery.eq).toHaveBeenCalledWith("group_id", GROUP_ONE);
    expect(matchesQuery.not).toHaveBeenCalledWith("active_revision_id", "is", null);
    expect(matchesQuery.order.mock.calls).toEqual([
      ["submitted_at", { ascending: false }],
      ["id", { ascending: false }],
    ]);
    expect(matchesQuery.limit).toHaveBeenCalledWith(5);
    expect(matchesQuery.limit.mock.invocationCallOrder[0]).toBeGreaterThan(matchesQuery.order.mock.invocationCallOrder[1]);
  });

  test("includes every stored match status for the group with equal-timestamp IDs descending", async () => {
    rowsByTable.matches = [
      { id: MATCH_OLD, group_id: GROUP_ONE, active_revision_id: REVISION_OLD, status: "confirmed", submitted_at: "2026-08-07T20:00:00.000Z", review_started_at: "2026-08-07T20:00:00.000Z" },
      { id: MATCH_OTHER, group_id: GROUP_ONE, active_revision_id: REVISION_OTHER, status: "disputed", submitted_at: "2026-08-07T20:00:00.000Z", review_started_at: "2026-08-07T20:00:00.000Z" },
      { id: MATCH_NEW, group_id: GROUP_ONE, active_revision_id: REVISION_NEW, status: "pending_confirmation", submitted_at: "2026-08-07T20:00:00.000Z", review_started_at: "2026-08-07T20:00:00.000Z" },
    ];

    const matches = await listGroupMatches(GROUP_ONE);

    expect(matches.map((match) => match.id)).toEqual([MATCH_OTHER, MATCH_OLD, MATCH_NEW]);
    expect(matches.map((match) => match.status)).toEqual(["disputed", "confirmed", "pending_confirmation"]);
  });

  test("shares current-user group authorization across landing readers", async () => {
    await Promise.all([
      canCurrentUserReadGroup(GROUP_ONE),
      getGroup(GROUP_ONE),
      listGroupActiveMatchDrafts(GROUP_ONE),
      listGroupMatches(GROUP_ONE),
      listGroupPlayers(GROUP_ONE),
    ]);

    expect(supabaseMocks.requireUserId).toHaveBeenCalledTimes(1);
    const membershipAuthorizationQueries = queriesByTable.group_memberships.filter((query) =>
      query.maybeSingle.mock.calls.length > 0,
    );
    expect(membershipAuthorizationQueries).toHaveLength(1);
  });

  test("maps an inclusive activity expiry without an extra history query", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T12:00:00.000Z"));
    rowsByTable.group_memberships = [
      { id: "membership-1", group_id: GROUP_ONE, user_id: OPPONENT, role: "member", status: "active", left_at: null },
      { id: "membership-2", group_id: GROUP_ONE, user_id: SUBMITTER, role: "owner", status: "active", left_at: null },
    ];
    rowsByTable.profiles = [
      { id: SUBMITTER, display_name: "Alice Tan", is_guest: false, active_until: "2026-08-11T12:00:00.000Z" },
      { id: OPPONENT, display_name: "Bea Rivera", is_guest: false, active_until: "2026-08-11T11:59:59.999Z" },
    ];

    try {
      const players = await listGroupPlayers(GROUP_ONE);

      expect(players.map(({ id, status }) => ({ id, status }))).toEqual([
        { id: SUBMITTER, status: "Active" },
        { id: OPPONENT, status: "Inactive" },
      ]);
      expect(queriesByTable.profiles[0].select).toHaveBeenCalledWith("id, display_name, is_guest, active_until");
      expect(from.mock.calls.filter(([table]) => table === "matches" || table === "match_participants")).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test("lists the current user's active-group matches newest first across groups", async () => {
    rowsByTable.group_memberships.push({
      id: "membership-2",
      group_id: GROUP_TWO,
      user_id: OPPONENT,
      status: "active",
      left_at: null,
    });
    rowsByTable.matches = [
      { ...rowsByTable.matches[0] as object, status: "disputed" },
      { ...rowsByTable.matches[1] as object, status: "confirmed" },
      { ...rowsByTable.matches[2] as object, status: "pending_confirmation" },
    ];

    const matches = await listCurrentUserMatches();

    expect(matches.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: MATCH_OTHER, status: "confirmed" },
      { id: MATCH_NEW, status: "pending_confirmation" },
      { id: MATCH_OLD, status: "disputed" },
    ]);
  });

  test("excludes active-group matches whose active revision omits the current user", async () => {
    rowsByTable.match_participants = rowsByTable.match_participants.filter((row) =>
      (row as { revision_id: string; user_id: string }).revision_id !== REVISION_NEW
      || (row as { revision_id: string; user_id: string }).user_id !== OPPONENT,
    );

    const matches = await listCurrentUserMatches();

    expect(matches.map((match) => match.id)).toEqual([MATCH_OLD]);
  });

  test("limits current-user match rows before hydrating them", async () => {
    const matches = await listCurrentUserMatches({ limit: 1 });

    expect(matches.map((match) => match.id)).toEqual([MATCH_NEW]);
    expect(queriesByTable.matches[0].limit).toHaveBeenCalledWith(1);
    expect(queriesByTable.match_revisions[0].in).toHaveBeenCalledWith("id", [REVISION_NEW]);
  });

  test("ranks every member by displayed rating regardless of membership row order", async () => {
    const unplayedId = "33333333-3333-4333-8333-333333333333";
    const ratedAtDefaultId = "44444444-4444-4444-8444-444444444444";
    rowsByTable.group_memberships = [
      { id: "membership-1", group_id: GROUP_ONE, user_id: unplayedId, role: "member", status: "active", left_at: null },
      { id: "membership-2", group_id: GROUP_ONE, user_id: OPPONENT, role: "member", status: "active", left_at: null },
      { id: "membership-3", group_id: GROUP_ONE, user_id: SUBMITTER, role: "owner", status: "active", left_at: null },
      { id: "membership-4", group_id: GROUP_ONE, user_id: ratedAtDefaultId, role: "member", status: "active", left_at: null },
    ];
    rowsByTable.profiles = [
      { id: unplayedId, display_name: "Charlie Unplayed", is_guest: false, active_until: null },
      { id: OPPONENT, display_name: "Zoe Low", is_guest: false, active_until: null },
      { id: SUBMITTER, display_name: "Alice High", is_guest: false, active_until: null },
      { id: ratedAtDefaultId, display_name: "Bea Rated", is_guest: false, active_until: null },
    ];
    rowsByTable.group_rating_states = [
      { group_id: GROUP_ONE, user_id: SUBMITTER, rating: "1600.4", rd: "120", rank: 1, games_played: 3 },
      { group_id: GROUP_ONE, user_id: ratedAtDefaultId, rating: "1500.2", rd: "140", rank: 2, games_played: 1 },
      { group_id: GROUP_ONE, user_id: OPPONENT, rating: "1400.4", rd: "160", rank: 3, games_played: 2 },
    ];

    const players = await listGroupPlayers(GROUP_ONE);

    expect(players.map(({ id, rating, rank }) => ({ id, rating, rank }))).toEqual([
      { id: SUBMITTER, rating: 1600, rank: 1 },
      { id: ratedAtDefaultId, rating: 1500, rank: 2 },
      { id: unplayedId, rating: 1500, rank: 3 },
      { id: OPPONENT, rating: 1400, rank: 4 },
    ]);
  });

  test("returns the current user's rank and active member count for every group alphabetically", async () => {
    rowsByTable.group_memberships = [
      { id: "membership-1", group_id: GROUP_ONE, user_id: OPPONENT, role: "member", status: "active", left_at: null },
      { id: "membership-2", group_id: GROUP_ONE, user_id: SUBMITTER, role: "owner", status: "active", left_at: null },
      { id: "membership-3", group_id: GROUP_TWO, user_id: OPPONENT, role: "member", status: "active", left_at: null },
      { id: "membership-4", group_id: GROUP_TWO, user_id: SUBMITTER, role: "owner", status: "active", left_at: null },
    ];
    rowsByTable.profiles = [
      { id: OPPONENT, display_name: "Bea Rivera", is_guest: false, active_until: null },
      { id: SUBMITTER, display_name: "Alice Tan", is_guest: false, active_until: null },
    ];
    rowsByTable.group_rating_states = [
      { group_id: GROUP_ONE, user_id: OPPONENT, rating: "1400.4", rd: "160", games_played: 2 },
      { group_id: GROUP_ONE, user_id: SUBMITTER, rating: "1600.4", rd: "120", games_played: 3 },
      { group_id: GROUP_TWO, user_id: OPPONENT, rating: "1700.4", rd: "100", games_played: 5 },
      { group_id: GROUP_TWO, user_id: SUBMITTER, rating: "1500.4", rd: "140", games_played: 1 },
    ];

    await expect(listCurrentUserRankings()).resolves.toEqual([
      { groupId: GROUP_TWO, groupName: "Other Club", rating: 1700, rank: 1, memberCount: 2 },
      { groupId: GROUP_ONE, groupName: "Wednesday Club", rating: 1400, rank: 2, memberCount: 2 },
    ]);
  });

  test("ranks missing rating states at the displayed default rating", async () => {
    rowsByTable.group_memberships = [
      { id: "membership-1", group_id: GROUP_ONE, user_id: OPPONENT, role: "member", status: "active", left_at: null },
      { id: "membership-2", group_id: GROUP_ONE, user_id: SUBMITTER, role: "owner", status: "active", left_at: null },
    ];
    rowsByTable.profiles = [
      { id: OPPONENT, display_name: "Bea Rivera", is_guest: false, active_until: null },
      { id: SUBMITTER, display_name: "Alice Tan", is_guest: false, active_until: null },
    ];
    rowsByTable.group_rating_states = [];

    await expect(listCurrentUserRankings()).resolves.toEqual([
      { groupId: GROUP_ONE, groupName: "Wednesday Club", rating: 1500, rank: 2, memberCount: 2 },
    ]);
  });

  test("lists only confirmable matches with the oldest review first", async () => {
    rowsByTable.match_confirmations = [];
    const matches = await listPendingReviewsForCurrentUser();

    expect(matches.map((match) => match.id)).toEqual([MATCH_OLD, MATCH_NEW]);
    expect(queriesByTable.matches[0].order.mock.calls).toEqual([
      ["review_started_at", { ascending: true }],
      ["id", { ascending: true }],
    ]);
  });

  test("preserves a stored draft winner when hydrating an editable participant", async () => {
    const draft = await getActiveMatchDraft("30303030-3030-4030-8030-303030303030");

    expect(draft).toMatchObject({
      role: "Participant",
      canEdit: true,
      initialMatch: {
        format: "singles",
        teamAUserIds: [SUBMITTER],
        teamBUserIds: [OPPONENT],
        games: [{ teamAScore: 12, teamBScore: 12, winnerTeam: "B" }],
      },
    });
  });

  test("derives a missing legacy draft winner from scores", async () => {
    (rowsByTable.active_match_drafts[0] as { games: unknown }).games = [{ teamAScore: 12, teamBScore: 12 }];

    const draft = await getActiveMatchDraft("30303030-3030-4030-8030-303030303030");

    expect(draft?.initialMatch.games).toEqual([{ teamAScore: 12, teamBScore: 12, winnerTeam: "A" }]);
  });

  test("hides current-user drafts after the user leaves their group", async () => {
    rowsByTable.group_memberships = [];

    await expect(listCurrentUserActiveMatchDrafts()).resolves.toEqual([]);
  });

  test("does not hydrate a draft route after the user leaves its group", async () => {
    rowsByTable.group_memberships = [];

    await expect(getActiveMatchDraft("30303030-3030-4030-8030-303030303030")).resolves.toBeNull();
  });

  test("enforces exact group and match pairing", async () => {
    await expect(getGroupMatchDetail(GROUP_ONE, MATCH_NEW)).resolves.toMatchObject({
      id: MATCH_NEW,
      revisionId: REVISION_NEW,
    });
    await expect(getGroupMatchDetail(GROUP_TWO, MATCH_NEW)).resolves.toBeNull();
  });

  test("hydrates every rating-event field needed for a match result", async () => {
    rowsByTable.rating_events = [{ revision_id: REVISION_NEW, user_id: SUBMITTER, sequence: "1", before_rating: "1500", before_rd: "350", after_rating: "1512", after_rd: "280" }];

    await expect(getGroupMatchDetail(GROUP_ONE, MATCH_NEW)).resolves.toMatchObject({
      teamA: [{ id: SUBMITTER, ratingChange: { previous: { rating: 1500, rd: 350 }, next: { rating: 1512, rd: 280 } } }],
    });
    expect(queriesByTable.rating_events[0].select).toHaveBeenCalledWith("revision_id, user_id, sequence, before_rating, before_rd, after_rating, after_rd");
  });

  test("preserves authorization on every exported group reader", async () => {
    rowsByTable.group_memberships = [];

    await expect(canCurrentUserReadGroup(GROUP_ONE)).resolves.toBe(false);
    await expect(getGroup(GROUP_ONE)).rejects.toThrow("not an active member");
    await expect(listGroupActiveMatchDrafts(GROUP_ONE)).rejects.toThrow("not an active member");
    await expect(listGroupPlayers(GROUP_ONE)).rejects.toThrow("not an active member");
    await expect(listGroupMatches(GROUP_ONE)).resolves.toEqual([]);
    await expect(getGroupMatchDetail(GROUP_ONE, MATCH_NEW)).resolves.toBeNull();
  });

  test("rejects malformed route identifiers before querying matches", async () => {
    await expect(getGroupMatchDetail("not-a-group", "not-a-match")).resolves.toBeNull();

    expect(from.mock.calls.filter(([table]) => table === "matches")).toHaveLength(0);
  });
});
