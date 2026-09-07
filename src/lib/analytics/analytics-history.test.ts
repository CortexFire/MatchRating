import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  AnalyticsHistoryVersionConflictError,
  listExactAnalyticsHistoryPage,
} from "./analytics-history";
import {
  decodeAnalyticsHistoryCursor,
  encodeAnalyticsHistoryCursor,
} from "./analytics-history-pagination";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

const groupId = "11111111-1111-4111-8111-111111111111";
const playerId = "22222222-2222-4222-8222-222222222222";
const matchId = "33333333-3333-4333-8333-333333333333";
const asOf = "2026-08-19T12:00:00.000Z";
const overflowingRatingVersion = "9223372036854775808";

describe("exact analytics history read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } },
      error: null,
    });
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
      rpc: mocks.rpc,
    });
  });

  test("rejects anonymous requests before invoking the authenticated RPC", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(listExactAnalyticsHistoryPage({
      groupId,
      playerId,
      period: "all",
      cursor: null,
    })).rejects.toThrow("You must be signed in to do that.");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  test.each([
    ["request", {
      groupId,
      playerId,
      period: "all",
      asOf,
      ratingVersion: overflowingRatingVersion,
      cursor: null,
    }, "Invalid analytics rating version"],
    ["cursor", {
      groupId,
      playerId,
      period: "all",
      cursor: encodeAnalyticsHistoryCursor({
        groupId,
        playerId,
        period: "all",
        asOf,
        ratingVersion: overflowingRatingVersion,
        occurredAt: "2026-08-18T12:00:00.000Z",
        matchId,
      }),
    }, "Invalid analytics history cursor"],
  ])("rejects an overflowing rating version from the %s before RPC", async (_label, input, message) => {
    await expect(listExactAnalyticsHistoryPage(input)).rejects.toThrow(
      message,
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  test("returns at most 50 newest-first exact points and an identity-bound cursor", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        asOf: "2026-08-19T12:00:00.000Z",
        ratingVersion: "7",
        points: [{
          matchId,
          occurredAt: "2026-08-18T12:00:00.000Z",
          rating: 1580,
          rd: 109.8,
          performanceSd: 85,
          ratingDelta: 12,
        }],
        hasMore: true,
      },
      error: null,
    });

    const page = await listExactAnalyticsHistoryPage({
      groupId,
      playerId,
      period: "90d",
      asOf: "2026-08-19T12:00:00.000Z",
      ratingVersion: "7",
      cursor: null,
    });

    expect(page.points).toHaveLength(1);
    expect(page.asOf).toBe("2026-08-19T12:00:00.000Z");
    expect(page.ratingVersion).toBe("7");
    expect(decodeAnalyticsHistoryCursor(page.nextCursor!)).toEqual({
      groupId,
      playerId,
      period: "90d",
      asOf: "2026-08-19T12:00:00.000Z",
      ratingVersion: "7",
      occurredAt: "2026-08-18T12:00:00.000Z",
      matchId,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("get_player_analytics_history_v2", {
      p_group_id: groupId,
      p_user_id: playerId,
      p_period: "90d",
      p_as_of: "2026-08-19T12:00:00.000Z",
      p_rating_version: "7",
      p_cursor_occurred_at: null,
      p_cursor_match_id: null,
      p_page_size: 50,
    });
  });

  test("does not expose a cursor when the database reports the last page", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        asOf: "2026-08-19T12:00:00.000Z",
        ratingVersion: "7",
        points: [],
        hasMore: false,
      },
      error: null,
    });

    await expect(listExactAnalyticsHistoryPage({
      groupId,
      playerId,
      period: "all",
      asOf: "2026-08-19T12:00:00.000Z",
      ratingVersion: "7",
      cursor: null,
    })).resolves.toMatchObject({ points: [], nextCursor: null });
  });

  test("preserves PostgreSQL microsecond order before applying the match ID tie-break", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        asOf: "2026-08-19T12:00:00.000000Z",
        ratingVersion: "7",
        points: [
          {
            matchId: "11111111-1111-4111-8111-111111111111",
            occurredAt: "2026-08-18T12:00:00.123900Z",
            rating: 1580,
            rd: 109.8,
            performanceSd: 85,
            ratingDelta: 12,
          },
          {
            matchId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
            occurredAt: "2026-08-18T12:00:00.123100Z",
            rating: 1579,
            rd: 110,
            performanceSd: 86,
            ratingDelta: 11,
          },
        ],
        hasMore: false,
      },
      error: null,
    });

    await expect(listExactAnalyticsHistoryPage({
      groupId,
      playerId,
      period: "all",
      cursor: null,
    })).resolves.toMatchObject({
      points: [
        { occurredAt: "2026-08-18T12:00:00.123900Z" },
        { occurredAt: "2026-08-18T12:00:00.123100Z" },
      ],
    });
  });

  test("applies descending match IDs when offsets represent the same instant", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        asOf: "2026-08-19T12:00:00Z",
        ratingVersion: "7",
        points: [
          {
            matchId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
            occurredAt: "2026-08-18T12:00:00.123100Z",
            rating: 1580,
            rd: 109.8,
            performanceSd: 85,
            ratingDelta: 12,
          },
          {
            matchId: "11111111-1111-4111-8111-111111111111",
            occurredAt: "2026-08-18T07:00:00.123100-05:00",
            rating: 1579,
            rd: 110,
            performanceSd: 86,
            ratingDelta: 11,
          },
        ],
        hasMore: false,
      },
      error: null,
    });

    await expect(listExactAnalyticsHistoryPage({
      groupId,
      playerId,
      period: "all",
      cursor: null,
    })).resolves.toMatchObject({
      points: [
        { matchId: "ffffffff-ffff-4fff-8fff-ffffffffffff" },
        { matchId: "11111111-1111-4111-8111-111111111111" },
      ],
    });
  });

  test("maps a version-guard failure to a stable conflict error", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "MR409", message: "Rating version changed" },
    });

    await expect(listExactAnalyticsHistoryPage({
      groupId,
      playerId,
      period: "all",
      asOf: "2026-08-19T12:00:00.000Z",
      ratingVersion: "7",
      cursor: null,
    })).rejects.toBeInstanceOf(AnalyticsHistoryVersionConflictError);
  });

  test.each([
    ["more than 50 points", { points: Array.from({ length: 51 }, () => ({
      matchId,
      occurredAt: "2026-08-18T12:00:00.000Z",
      rating: 1,
      rd: 1,
      performanceSd: 1,
      ratingDelta: 1,
    })) }],
    ["ascending points", { points: [
      {
        matchId,
        occurredAt: "2026-08-17T12:00:00.000Z",
        rating: 1,
        rd: 1,
        performanceSd: 1,
        ratingDelta: 1,
      },
      {
        matchId: "44444444-4444-4444-8444-444444444444",
        occurredAt: "2026-08-18T12:00:00.000Z",
        rating: 1,
        rd: 1,
        performanceSd: 1,
        ratingDelta: 1,
      },
    ] }],
  ])("rejects malformed RPC data: %s", async (_label, overrides) => {
    mocks.rpc.mockResolvedValue({
      data: {
        asOf: "2026-08-19T12:00:00.000Z",
        ratingVersion: "7",
        hasMore: false,
        ...overrides,
      },
      error: null,
    });

    await expect(listExactAnalyticsHistoryPage({
      groupId,
      playerId,
      period: "all",
      cursor: null,
    })).rejects.toThrow("get_player_analytics_history_v2 returned an invalid payload");
  });
});
