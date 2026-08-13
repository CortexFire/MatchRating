import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  canCurrentUserReadGroup,
  getGroup,
  getGroupMatchDetail,
  listCurrentUserGroups,
  listCurrentUserMatches,
  listMatchHistoryPage,
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

const supabaseMocks = vi.hoisted(() => {
  const resolveUserId = vi.fn();
  let userIdPromise: Promise<string> | undefined;
  return {
    createSupabaseServerClient: vi.fn(),
    createSupabaseServiceClient: vi.fn(),
    requireUserId: () => (userIdPromise ??= resolveUserId()),
    resolveUserId,
    resetUserId: () => {
      userIdPromise = undefined;
    },
  };
});

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
const MATCH_GUEST = "33333333-3333-4333-8333-333333333333";
const DRAFT_GUEST = "44444444-4444-4444-8444-444444444444";
const ORPHAN_GUEST = "55555555-5555-4555-8555-555555555555";
const OTHER_GROUP_GUEST = "66666666-6666-4666-8666-666666666666";
const EXPIRED_DRAFT_GUEST = "77777777-7777-4777-8777-777777777777";
const SUBMITTED_DRAFT_GUEST = "88888888-8888-4888-8888-888888888888";

const baseRows: Record<string, unknown[]> = {
  group_memberships: [{ id: "membership-1", group_id: GROUP_ONE, user_id: OPPONENT, role: "member", status: "active", left_at: null }],
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
  profiles: [
    { id: SUBMITTER, display_name: "Alice Tan", is_guest: false, active_until: null },
    { id: OPPONENT, display_name: "Bea Rivera", is_guest: false, active_until: null },
  ],
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
let errorsByTable: Record<string, Error | null>;
let from: ReturnType<typeof vi.fn>;
let rpc: ReturnType<typeof vi.fn>;
let queriesByTable: Record<string, Array<ReturnType<typeof makeQuery>>>;

function makeQuery(table: string) {
  let rows = rowsByTable[table] ?? [];
  const orders: Array<{ column: string; ascending: boolean }> = [];
  let rowLimit: number | undefined;
  const query = {
    select: vi.fn((columns?: string) => {
      void columns;
      return query;
    }),
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
    gt: vi.fn((column: string, value: unknown) => {
      rows = rows.filter((row) => String((row as Record<string, unknown>)[column] ?? "") > String(value));
      return query;
    }),
    or: vi.fn(() => query),
    order: vi.fn((column: string, options: { ascending: boolean }) => {
      orders.push({ column, ascending: options.ascending });
      return query;
    }),
    limit: vi.fn((value: number) => {
      rowLimit = value;
      return query;
    }),
    maybeSingle: vi.fn(async () => ({ data: materialize()[0] ?? null, error: errorsByTable[table] ?? null })),
    then: (resolve: (value: { data: unknown[]; error: Error | null }) => unknown) =>
      resolve({ data: materialize(), error: errorsByTable[table] ?? null }),
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
    supabaseMocks.resetUserId();
    reactMocks.values.clear();
    rowsByTable = structuredClone(baseRows);
    errorsByTable = {};
    queriesByTable = {};
    from = vi.fn((table: string) => {
      const query = makeQuery(table);
      (queriesByTable[table] ??= []).push(query);
      return query;
    });
    rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
      const groupId = args.p_group_id as string | null;
      const status = args.p_status as string | null;
      const participantRevisionIds = new Set(
        rowsByTable.match_participants
          .filter((row) => (row as { user_id: string }).user_id === OPPONENT)
          .map((row) => (row as { revision_id: string }).revision_id),
      );
      const activeGroupIds = new Set(
        rowsByTable.group_memberships
          .filter((row) => {
            const membership = row as { user_id: string; status: string; left_at: string | null };
            return membership.user_id === OPPONENT && membership.status === "active" && membership.left_at === null;
          })
          .map((row) => (row as { group_id: string }).group_id),
      );
      const data = rowsByTable.matches
        .filter((row) => {
          const match = row as { group_id: string; active_revision_id: string | null; status: string };
          if (!match.active_revision_id || (status && match.status !== status)) return false;
          return groupId
            ? match.group_id === groupId
            : activeGroupIds.has(match.group_id) && participantRevisionIds.has(match.active_revision_id);
        })
        .sort((left, right) => {
          const leftMatch = left as { submitted_at: string; id: string };
          const rightMatch = right as { submitted_at: string; id: string };
          return rightMatch.submitted_at.localeCompare(leftMatch.submitted_at) || rightMatch.id.localeCompare(leftMatch.id);
        })
        .slice(0, args.p_limit as number);
      return { data, error: null };
    });
    supabaseMocks.resolveUserId.mockResolvedValue(OPPONENT);
    supabaseMocks.createSupabaseServiceClient.mockReturnValue({ from });
    supabaseMocks.createSupabaseServerClient.mockResolvedValue({ rpc });
  });

  test("hydrates at most 20 matches and returns an opaque cursor when another row exists", async () => {
    const pageRows = Array.from({ length: 21 }, (_, index) => {
      const suffix = String(index + 1).padStart(12, "0");
      return {
        id: `90000000-0000-4000-8000-${suffix}`,
        group_id: GROUP_ONE,
        active_revision_id: `91000000-0000-4000-8000-${suffix}`,
        status: "confirmed",
        submitted_at: `2026-08-${String(31 - index).padStart(2, "0")}T12:00:00.000Z`,
        review_started_at: `2026-08-${String(31 - index).padStart(2, "0")}T12:00:00.000Z`,
      };
    });
    rowsByTable.match_revisions = pageRows.map((match) => ({
      id: match.active_revision_id,
      match_id: match.id,
      submitted_by_user_id: SUBMITTER,
      format: "singles",
    }));
    rowsByTable.match_participants = pageRows.flatMap((match) => [
      { revision_id: match.active_revision_id, user_id: SUBMITTER, team: "A", slot: 1 },
      { revision_id: match.active_revision_id, user_id: OPPONENT, team: "B", slot: 1 },
    ]);
    rowsByTable.match_games = pageRows.map((match) => ({
      revision_id: match.active_revision_id,
      game_number: 1,
      team_a_score: 21,
      team_b_score: 18,
      winner_team: "A",
    }));
    rpc.mockResolvedValue({ data: pageRows, error: null });

    const page = await listMatchHistoryPage({ status: "confirmed", search: "  Alice  " });

    expect(page.matches).toHaveLength(20);
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(page.nextCursor).not.toContain(pageRows[19].submitted_at);
    expect(rpc).toHaveBeenCalledWith("list_match_history_page", {
      p_group_id: null,
      p_status: "confirmed",
      p_search: "Alice",
      p_before_submitted_at: null,
      p_before_match_id: null,
      p_limit: 21,
    });
    expect(queriesByTable.match_revisions[0].in).toHaveBeenCalledWith(
      "id",
      pageRows.slice(0, 20).map((match) => match.active_revision_id),
    );
  });

  test("keeps the recent current-user reader bounded without loading every participant revision", async () => {
    await listCurrentUserMatches({ limit: 3 });

    expect(rpc).toHaveBeenCalledWith("list_match_history_page", expect.objectContaining({
      p_group_id: null,
      p_limit: 3,
    }));
    expect(queriesByTable.match_participants.every((query) =>
      query.select.mock.calls.every(([columns]) => columns !== "revision_id"),
    )).toBe(true);
  });

  test("orders one group's hydrated matches newest first", async () => {
    const matches = await listGroupMatches(GROUP_ONE, { limit: 20 });

    expect(matches.map((match) => match.id)).toEqual([MATCH_NEW, MATCH_OLD]);
    expect(matches.every((match) => match.groupId === GROUP_ONE)).toBe(true);
  });

  test("limits the constrained newest-first match rows before hydration", async () => {
    rowsByTable.matches = [
      { id: "99999999-9999-4999-8999-999999999999", group_id: GROUP_ONE, active_revision_id: null, status: "confirmed", submitted_at: "2026-08-09T20:00:00.000Z", review_started_at: "2026-08-09T20:00:00.000Z" },
      ...rowsByTable.matches,
    ];

    await listGroupMatches(GROUP_ONE, { limit: 5 });

    expect(rpc).toHaveBeenCalledWith("list_match_history_page", expect.objectContaining({
      p_group_id: GROUP_ONE,
      p_limit: 5,
    }));
    expect(queriesByTable.matches).toBeUndefined();
  });

  test("includes every stored match status for the group with equal-timestamp IDs descending", async () => {
    rowsByTable.matches = [
      { id: MATCH_OLD, group_id: GROUP_ONE, active_revision_id: REVISION_OLD, status: "confirmed", submitted_at: "2026-08-07T20:00:00.000Z", review_started_at: "2026-08-07T20:00:00.000Z" },
      { id: MATCH_OTHER, group_id: GROUP_ONE, active_revision_id: REVISION_OTHER, status: "disputed", submitted_at: "2026-08-07T20:00:00.000Z", review_started_at: "2026-08-07T20:00:00.000Z" },
      { id: MATCH_NEW, group_id: GROUP_ONE, active_revision_id: REVISION_NEW, status: "pending_confirmation", submitted_at: "2026-08-07T20:00:00.000Z", review_started_at: "2026-08-07T20:00:00.000Z" },
    ];

    const matches = await listGroupMatches(GROUP_ONE, { limit: 20 });

    expect(matches.map((match) => match.id)).toEqual([MATCH_OTHER, MATCH_OLD, MATCH_NEW]);
    expect(matches.map((match) => match.status)).toEqual(["disputed", "confirmed", "pending_confirmation"]);
  });

  test("shares current-user group authorization across landing readers", async () => {
    await Promise.all([
      canCurrentUserReadGroup(GROUP_ONE),
      getGroup(GROUP_ONE),
      listGroupMatches(GROUP_ONE, { limit: 20 }),
      listGroupPlayers(GROUP_ONE),
    ]);

    expect(supabaseMocks.resolveUserId).toHaveBeenCalledTimes(1);
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
      expect(
        from.mock.calls.filter(([table]) =>
          ["matches", "match_participants", "match_revisions", "active_match_drafts"].includes(table),
        ),
      ).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test("shows only group-associated guests with Guest roles and contiguous ranks", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T12:00:00.000Z"));
    rowsByTable.group_memberships = [
      { group_id: GROUP_ONE, user_id: SUBMITTER, role: "owner", status: "active", left_at: null },
      { group_id: GROUP_ONE, user_id: OPPONENT, role: "admin", status: "active", left_at: null },
      ...[MATCH_GUEST, DRAFT_GUEST, ORPHAN_GUEST, OTHER_GROUP_GUEST, EXPIRED_DRAFT_GUEST, SUBMITTED_DRAFT_GUEST].map((user_id) => ({
        group_id: GROUP_ONE,
        user_id,
        role: "member",
        status: "active",
        left_at: null,
      })),
    ];
    rowsByTable.profiles = [
      { id: SUBMITTER, display_name: "Alice Owner", is_guest: false, active_until: null },
      { id: OPPONENT, display_name: "Bea Admin", is_guest: false, active_until: null },
      { id: MATCH_GUEST, display_name: "Match Guest", is_guest: true, active_until: null },
      { id: DRAFT_GUEST, display_name: "Draft Guest", is_guest: true, active_until: null },
      { id: ORPHAN_GUEST, display_name: "Orphan Guest", is_guest: true, active_until: null },
      { id: OTHER_GROUP_GUEST, display_name: "Other Group Guest", is_guest: true, active_until: null },
      { id: EXPIRED_DRAFT_GUEST, display_name: "Expired Guest", is_guest: true, active_until: null },
      { id: SUBMITTED_DRAFT_GUEST, display_name: "Submitted Guest", is_guest: true, active_until: null },
    ];
    rowsByTable.group_rating_states = [
      { group_id: GROUP_ONE, user_id: SUBMITTER, rating: 1700, rd: 80, games_played: 5 },
      { group_id: GROUP_ONE, user_id: MATCH_GUEST, rating: 1600, rd: 90, games_played: 2 },
      { group_id: GROUP_ONE, user_id: DRAFT_GUEST, rating: 1500, rd: 350, games_played: 0 },
      { group_id: GROUP_ONE, user_id: OPPONENT, rating: 1400, rd: 120, games_played: 3 },
    ];
    rowsByTable.matches = [
      { id: MATCH_OLD, group_id: GROUP_ONE, active_revision_id: REVISION_NEW, status: "confirmed", submitted_at: "2026-08-01T00:00:00.000Z" },
      { id: MATCH_OTHER, group_id: GROUP_TWO, active_revision_id: REVISION_OTHER, status: "confirmed", submitted_at: "2026-08-02T00:00:00.000Z" },
    ];
    rowsByTable.match_revisions = [
      { id: REVISION_OLD, match_id: MATCH_OLD, submitted_by_user_id: SUBMITTER, format: "singles" },
      { id: REVISION_OTHER, match_id: MATCH_OTHER, submitted_by_user_id: SUBMITTER, format: "singles" },
    ];
    rowsByTable.match_participants = [
      { revision_id: REVISION_OLD, user_id: MATCH_GUEST, team: "B", slot: 1 },
      { revision_id: REVISION_OTHER, user_id: OTHER_GROUP_GUEST, team: "B", slot: 1 },
    ];
    rowsByTable.active_match_drafts = [
      { group_id: GROUP_ONE, team_a_user_ids: [SUBMITTER], team_b_user_ids: [DRAFT_GUEST], expires_at: "2026-08-13T00:00:00.000Z", submitted_match_id: null },
      { group_id: GROUP_ONE, team_a_user_ids: [SUBMITTER], team_b_user_ids: [EXPIRED_DRAFT_GUEST], expires_at: "2026-08-11T00:00:00.000Z", submitted_match_id: null },
      { group_id: GROUP_ONE, team_a_user_ids: [SUBMITTER], team_b_user_ids: [SUBMITTED_DRAFT_GUEST], expires_at: "2026-08-13T00:00:00.000Z", submitted_match_id: MATCH_OLD },
      { group_id: GROUP_TWO, team_a_user_ids: [SUBMITTER], team_b_user_ids: [OTHER_GROUP_GUEST], expires_at: "2026-08-13T00:00:00.000Z", submitted_match_id: null },
    ];

    try {
      const players = await listGroupPlayers(GROUP_ONE);

      expect(players.map(({ id, role, rank }) => ({ id, role, rank }))).toEqual([
        { id: SUBMITTER, role: "Owner", rank: 1 },
        { id: MATCH_GUEST, role: "Guest", rank: 2 },
        { id: DRAFT_GUEST, role: "Guest", rank: 3 },
        { id: OPPONENT, role: "Admin", rank: 4 },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("propagates guest association query failures", async () => {
    rowsByTable.group_memberships = [
      { group_id: GROUP_ONE, user_id: OPPONENT, role: "member", status: "active", left_at: null },
      { group_id: GROUP_ONE, user_id: ORPHAN_GUEST, role: "member", status: "active", left_at: null },
    ];
    rowsByTable.profiles = [
      { id: OPPONENT, display_name: "Bea Rivera", is_guest: false, active_until: null },
      { id: ORPHAN_GUEST, display_name: "Orphan Guest", is_guest: true, active_until: null },
    ];
    errorsByTable.active_match_drafts = new Error("draft lookup failed");

    await expect(listGroupPlayers(GROUP_ONE)).rejects.toThrow("draft lookup failed");
  });

  test("uses visible memberships for current-user and individual group counts", async () => {
    rowsByTable.group_memberships = [
      { group_id: GROUP_ONE, user_id: OPPONENT, role: "member", status: "active", left_at: null },
      { group_id: GROUP_ONE, user_id: ORPHAN_GUEST, role: "member", status: "active", left_at: null },
    ];
    rowsByTable.profiles = [
      { id: OPPONENT, display_name: "Bea Rivera", is_guest: false, active_until: null },
      { id: ORPHAN_GUEST, display_name: "Orphan Guest", is_guest: true, active_until: null },
    ];
    rowsByTable.active_match_drafts = [];
    rowsByTable.match_participants = [];

    const [groups, group] = await Promise.all([listCurrentUserGroups(), getGroup(GROUP_ONE)]);

    expect(groups.find(({ id }) => id === GROUP_ONE)?.memberCount).toBe(1);
    expect(group?.memberCount).toBe(1);
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

  test("lists only confirmable matches with the oldest review first", async () => {
    rowsByTable.match_confirmations = [];
    const matches = await listPendingReviewsForCurrentUser();

    expect(matches.map((match) => match.id)).toEqual([MATCH_OLD, MATCH_NEW]);
    expect(queriesByTable.matches[0].order.mock.calls).toEqual([
      ["review_started_at", { ascending: true }],
      ["id", { ascending: true }],
    ]);
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
    await expect(listGroupPlayers(GROUP_ONE)).rejects.toThrow("not an active member");
    await expect(listGroupMatches(GROUP_ONE, { limit: 20 })).resolves.toEqual([]);
    await expect(getGroupMatchDetail(GROUP_ONE, MATCH_NEW)).resolves.toBeNull();
  });

  test("rejects malformed route identifiers before querying matches", async () => {
    await expect(getGroupMatchDetail("not-a-group", "not-a-match")).resolves.toBeNull();

    expect(from.mock.calls.filter(([table]) => table === "matches")).toHaveLength(0);
  });
});
