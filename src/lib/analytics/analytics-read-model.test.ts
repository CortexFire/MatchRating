import { beforeEach, describe, expect, test, vi } from "vitest";
import { getPlayerAnalyticsData } from "./analytics-read-model";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

const groupId = "11111111-1111-4111-8111-111111111111";
const playerId = "22222222-2222-4222-8222-222222222222";

function period(overrides: Record<string, unknown> = {}) {
  return {
    matchCount: 1,
    wins: 1,
    gameCount: 1,
    gameWins: 1,
    expectedGameWins: 0.5,
    ratingDelta: 12,
    upsetWins: 0,
    residualCount: 1,
    residualSum: 0.5,
    residualSumSquares: 0.25,
    activePeerCount: 0,
    encounteredActiveCount: 0,
    cohort: [{
      userId: playerId,
      matchCount: 1,
      ratingDelta: 12,
      doublesMatchCount: 0,
      distinctPartnerCount: 0,
    }],
    relationships: [],
    ratingHistory: [{
      matchId: "33333333-3333-4333-8333-333333333333",
      occurredAt: "2026-08-18T12:00:00.000Z",
      rating: 1580,
      rd: 109.8,
      performanceSd: 85,
      ratingDelta: 12,
    }],
    ratingHistoryBounds: [1475, 1685],
    ...overrides,
  };
}

function readyPayload(periodOverrides: Record<string, unknown> = {}) {
  const snapshot = period(periodOverrides);
  return {
    status: "ready",
    asOf: "2026-08-19T12:00:00.000Z",
    ratingVersion: "7",
    viewerUserId: playerId,
    subject: { id: playerId, name: "Bea Rivera" },
    group: { id: groupId, name: "Downtown Rec" },
    availableGroups: [{ id: groupId, name: "Downtown Rec" }],
    current: { rating: 1580, rd: 110.01, rank: 2, rankedPlayerCount: 8 },
    currentWinStreak: 1,
    periods: { all: snapshot, "30d": snapshot, "90d": snapshot, "1y": snapshot },
  };
}

describe("player analytics read model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSupabaseServerClient.mockResolvedValue({ rpc: mocks.rpc });
  });

  test("rejects malformed identifiers before opening a database client", async () => {
    await expect(getPlayerAnalyticsData("not-a-group", playerId)).resolves.toBeNull();
    await expect(getPlayerAnalyticsData(groupId, "not-a-player")).resolves.toBeNull();
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  test("projects the bounded versioned analytics RPC payload", async () => {
    mocks.rpc.mockResolvedValue({ data: readyPayload(), error: null });

    const result = await getPlayerAnalyticsData(groupId, playerId);

    expect(result).toMatchObject({
      status: "ready",
      ratingVersion: "7",
      subject: { id: playerId, name: "Bea Rivera" },
      historyPoints: {
        "33333333-3333-4333-8333-333333333333": {
          rating: 1580,
          rd: 109.8,
          performanceSd: 85,
        },
      },
      periods: {
        all: {
          summary: { currentRd: 110.01 },
          ratingHistoryPointIds: ["33333333-3333-4333-8333-333333333333"],
          ratingHistoryBounds: [1475, 1685],
        },
      },
    });
    expect(mocks.rpc).toHaveBeenCalledWith("get_player_analytics_v2", {
      p_group_id: groupId,
      p_user_id: playerId,
    });
  });

  test("preserves the bounded updating response", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        status: "updating",
        asOf: "2026-08-19T12:00:00.000Z",
        viewerUserId: playerId,
        subject: { id: playerId, name: "Bea Rivera" },
        group: { id: groupId, name: "Downtown Rec" },
        availableGroups: [{ id: groupId, name: "Downtown Rec" }],
      },
      error: null,
    });

    await expect(getPlayerAnalyticsData(groupId, playerId)).resolves.toEqual({
      status: "updating",
      asOf: "2026-08-19T12:00:00.000Z",
      viewerUserId: playerId,
      subject: { id: playerId, name: "Bea Rivera" },
      group: { id: groupId, name: "Downtown Rec" },
      availableGroups: [{ id: groupId, name: "Downtown Rec" }],
    });
  });

  test("returns null for an inaccessible player without leaking a second query", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    await expect(getPlayerAnalyticsData(groupId, playerId)).resolves.toBeNull();
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  test.each([
    ["missing rating version", (() => {
      const value: Partial<ReturnType<typeof readyPayload>> = readyPayload();
      delete value.ratingVersion;
      return value;
    })()],
    ["more than 200 sampled points", readyPayload({
      ratingHistory: Array.from({ length: 201 }, (_, index) => ({
        matchId: `${String(index).padStart(8, "0")}-0000-4000-8000-000000000000`,
        occurredAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
        rating: 1500,
        rd: 100,
        performanceSd: 80,
        ratingDelta: 0,
      })),
    })],
    ["invalid bounds", readyPayload({ ratingHistoryBounds: [1700, 1400] })],
    ["invalid relationship total", readyPayload({
      relationships: [{
        player: { id: "other", name: "Other" },
        kind: "opponent",
        matches: -1,
        wins: 0,
        gameCount: 0,
        gameWins: 0,
        expectedGameWins: 0,
      }],
    })],
  ])("rejects a malformed bounded payload: %s", async (_label, data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });

    await expect(getPlayerAnalyticsData(groupId, playerId)).rejects.toThrow(
      "get_player_analytics_v2 returned an invalid payload",
    );
  });

  test("propagates RPC failures", async () => {
    const error = new Error("analytics unavailable");
    mocks.rpc.mockResolvedValue({ data: null, error });

    await expect(getPlayerAnalyticsData(groupId, playerId)).rejects.toBe(error);
  });
});
