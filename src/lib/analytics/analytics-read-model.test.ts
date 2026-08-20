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

  test("projects the single authenticated RPC payload", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        status: "ready",
        asOf: "2026-08-19T12:00:00.000Z",
        viewerUserId: playerId,
        subject: { id: playerId, name: "Bea Rivera" },
        group: { id: groupId, name: "Downtown Rec" },
        availableGroups: [{ id: groupId, name: "Downtown Rec" }],
        current: { rating: 1580, rank: 2, rankedPlayerCount: 8 },
        activePlayerIds: [playerId],
        matches: [],
        cohortDaily: [],
        cohortPartners: [],
      },
      error: null,
    });

    const result = await getPlayerAnalyticsData(groupId, playerId);

    expect(result).toEqual(expect.objectContaining({
      status: "ready",
      subject: { id: playerId, name: "Bea Rivera" },
    }));
    expect(mocks.rpc).toHaveBeenCalledWith("get_player_analytics_facts", {
      p_group_id: groupId,
      p_user_id: playerId,
    });
  });

  test("returns null for an inaccessible player without leaking a second query", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    await expect(getPlayerAnalyticsData(groupId, playerId)).resolves.toBeNull();
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  test("rejects malformed successful payloads", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "ready" }, error: null });

    await expect(getPlayerAnalyticsData(groupId, playerId)).rejects.toThrow(
      "get_player_analytics_facts returned an invalid payload",
    );
  });

  test("propagates RPC failures", async () => {
    const error = new Error("analytics unavailable");
    mocks.rpc.mockResolvedValue({ data: null, error });

    await expect(getPlayerAnalyticsData(groupId, playerId)).rejects.toBe(error);
  });
});
