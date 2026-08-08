import { beforeEach, describe, expect, test, vi } from "vitest";
import { getGroupMatchDetail, listGroupMatches, listPendingReviewsForCurrentUser } from "./app-data";

const supabaseMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
  requireUserId: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => supabaseMocks);

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
    { id: MATCH_OLD, group_id: GROUP_ONE, active_revision_id: REVISION_OLD, status: "pending_confirmation", submitted_at: "2026-08-06T20:00:00.000Z" },
    { id: MATCH_OTHER, group_id: GROUP_TWO, active_revision_id: REVISION_OTHER, status: "pending_confirmation", submitted_at: "2026-08-08T20:00:00.000Z" },
    { id: MATCH_NEW, group_id: GROUP_ONE, active_revision_id: REVISION_NEW, status: "pending_confirmation", submitted_at: "2026-08-07T20:00:00.000Z" },
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
};

let rowsByTable: Record<string, unknown[]>;
let from: ReturnType<typeof vi.fn>;

function makeQuery(table: string) {
  let rows = rowsByTable[table] ?? [];
  const orders: Array<{ column: string; ascending: boolean }> = [];
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
    order: vi.fn((column: string, options: { ascending: boolean }) => {
      orders.push({ column, ascending: options.ascending });
      return query;
    }),
    maybeSingle: vi.fn(async () => ({ data: materialize()[0] ?? null, error: null })),
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => resolve({ data: materialize(), error: null }),
  };

  function materialize() {
    return [...rows].sort((left, right) => {
      for (const order of orders) {
        const leftValue = String((left as Record<string, unknown>)[order.column] ?? "");
        const rightValue = String((right as Record<string, unknown>)[order.column] ?? "");
        const comparison = leftValue.localeCompare(rightValue);
        if (comparison) return order.ascending ? comparison : -comparison;
      }
      return 0;
    });
  }

  return query;
}

describe("stored match reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rowsByTable = structuredClone(baseRows);
    from = vi.fn((table: string) => makeQuery(table));
    supabaseMocks.requireUserId.mockResolvedValue(OPPONENT);
    supabaseMocks.createSupabaseServiceClient.mockReturnValue({ from });
  });

  test("orders one group's hydrated matches newest first", async () => {
    const matches = await listGroupMatches(GROUP_ONE);

    expect(matches.map((match) => match.id)).toEqual([MATCH_NEW, MATCH_OLD]);
    expect(matches.every((match) => match.groupId === GROUP_ONE)).toBe(true);
  });

  test("lists only pending matches the current user can still review", async () => {
    const matches = await listPendingReviewsForCurrentUser();

    expect(matches.map((match) => match.id)).toEqual([MATCH_NEW]);
  });

  test("enforces exact group and match pairing", async () => {
    await expect(getGroupMatchDetail(GROUP_ONE, MATCH_NEW)).resolves.toMatchObject({
      id: MATCH_NEW,
      revisionId: REVISION_NEW,
    });
    await expect(getGroupMatchDetail(GROUP_TWO, MATCH_NEW)).resolves.toBeNull();
  });

  test("returns no match data without active membership", async () => {
    rowsByTable.group_memberships = [];

    await expect(listGroupMatches(GROUP_ONE)).resolves.toEqual([]);
    await expect(getGroupMatchDetail(GROUP_ONE, MATCH_NEW)).resolves.toBeNull();
  });

  test("rejects malformed route identifiers before querying matches", async () => {
    await expect(getGroupMatchDetail("not-a-group", "not-a-match")).resolves.toBeNull();

    expect(from.mock.calls.filter(([table]) => table === "matches")).toHaveLength(0);
  });
});
