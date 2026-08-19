import { beforeEach, describe, expect, test, vi } from "vitest";
import { FatalError } from "workflow";
import {
  applyProjection,
  calculateProjection,
  loadRebuildInput,
  markFailed,
  rebuildGroupRatingsWorkflow,
} from "./rebuild-group-ratings";

const supabaseMocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => supabaseMocks);

describe("rating rebuild workflow failure handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMocks.createSupabaseServiceClient.mockReturnValue({ rpc: supabaseMocks.rpc });
  });

  test("throws when the failed-job marker cannot be persisted", async () => {
    supabaseMocks.rpc.mockResolvedValue({ data: null, error: new Error("database unavailable") });

    await expect(markFailed("job-1", "projection failed")).rejects.toThrow("database unavailable");
  });

  test("persists the failure message through the worker RPC", async () => {
    supabaseMocks.rpc.mockResolvedValue({ data: null, error: null });

    await expect(markFailed("job-1", "projection failed")).resolves.toBeUndefined();
    expect(supabaseMocks.rpc).toHaveBeenCalledWith("fail_rating_rebuild", {
      p_job_id: "job-1",
      p_error: "projection failed",
    });
  });

  test("loads seeded suffix input through the incremental worker RPC", async () => {
    const input = {
      groupId: "group-1",
      jobId: "job-1",
      targetVersion: 8,
      prefixEventCount: 6,
      initialRatings: [
        { userId: "alice", rating: 1510, rd: 120, volatility: 0.06, gamesPlayed: 3 },
      ],
      history: [],
    };
    supabaseMocks.rpc.mockResolvedValue({ data: input, error: null });

    await expect(loadRebuildInput("job-1", "dispatch-1")).resolves.toEqual(input);
    expect(supabaseMocks.rpc).toHaveBeenCalledWith("begin_incremental_rating_rebuild", {
      p_job_id: "job-1",
      p_dispatch_token: "dispatch-1",
    });
  });

  test("calculates a suffix from seeded ratings and continues event sequences", async () => {
    const projection = await calculateProjection({
      groupId: "group-1",
      jobId: "job-1",
      targetVersion: 8,
      prefixEventCount: 6,
      initialRatings: [
        { userId: "alice", rating: 1510, rd: 120, volatility: 0.06, gamesPlayed: 3 },
        { userId: "bea", rating: 1490, rd: 130, volatility: 0.06, gamesPlayed: 3 },
        { userId: "prefix-only", rating: 1600, rd: 100, volatility: 0.05, gamesPlayed: 5 },
      ],
      history: [
        {
          id: "match-2",
          revisionId: "revision-2",
          submittedAt: "2026-08-02T00:00:00.000Z",
          format: "singles",
          teamAUserIds: ["alice"],
          teamBUserIds: ["bea"],
          games: [{
            gameId: "game-2",
            gameNumber: 1,
            teamAScore: 21,
            teamBScore: 18,
            winnerTeam: "A",
          }],
        },
      ],
    });

    expect(projection.events.map((event) => event.sequence)).toEqual([7, 8]);
    expect(projection.ratings).toContainEqual(expect.objectContaining({
      userId: "prefix-only",
      rating: 1600,
      gamesPlayed: 5,
    }));
  });

  test("applies a suffix with its preserved prefix count", async () => {
    const input = {
      groupId: "group-1",
      jobId: "job-1",
      targetVersion: 8,
      prefixEventCount: 6,
      initialRatings: [],
      history: [],
    };
    supabaseMocks.rpc.mockResolvedValue({ data: { status: "completed" }, error: null });

    await expect(applyProjection(input, { ratings: [], events: [] })).resolves.toEqual({
      status: "completed",
    });
    expect(supabaseMocks.rpc).toHaveBeenCalledWith("apply_incremental_rating_rebuild", {
      p_job_id: "job-1",
      p_expected_version: 8,
      p_prefix_event_count: 6,
      p_ratings: [],
      p_events: [],
    });
  });

  test("rejects a nonfinite expected score before applying the suffix", async () => {
    const input = {
      groupId: "10000000-0000-4000-8000-000000000001",
      jobId: "10000000-0000-4000-8000-000000000002",
      targetVersion: 8,
      prefixEventCount: 0,
      initialRatings: [],
      history: [{
        id: "10000000-0000-4000-8000-000000000003",
        revisionId: "10000000-0000-4000-8000-000000000004",
        submittedAt: "2026-08-02T00:00:00.000Z",
        format: "singles" as const,
        teamAUserIds: ["10000000-0000-4000-8000-000000000005"],
        teamBUserIds: ["10000000-0000-4000-8000-000000000006"],
        games: [{
          gameId: "10000000-0000-4000-8000-000000000007",
          gameNumber: 1,
          teamAScore: 21,
          teamBScore: 18,
          winnerTeam: "A" as const,
        }],
      }],
    };
    const projection = await calculateProjection(input);
    projection.events[0].expectedScore = Number.NaN;

    await expect(applyProjection(input, projection)).rejects.toBeInstanceOf(FatalError);
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
  });

  test("rejects duplicate game and player facts before applying the suffix", async () => {
    const input = {
      groupId: "20000000-0000-4000-8000-000000000001",
      jobId: "20000000-0000-4000-8000-000000000002",
      targetVersion: 8,
      prefixEventCount: 0,
      initialRatings: [],
      history: [{
        id: "20000000-0000-4000-8000-000000000003",
        revisionId: "20000000-0000-4000-8000-000000000004",
        submittedAt: "2026-08-02T00:00:00.000Z",
        format: "singles" as const,
        teamAUserIds: ["20000000-0000-4000-8000-000000000005"],
        teamBUserIds: ["20000000-0000-4000-8000-000000000006"],
        games: [{
          gameId: "20000000-0000-4000-8000-000000000007",
          gameNumber: 1,
          teamAScore: 21,
          teamBScore: 18,
          winnerTeam: "A" as const,
        }],
      }],
    };
    const projection = await calculateProjection(input);
    projection.events.push({ ...projection.events[0], sequence: 3 });

    await expect(applyProjection(input, projection)).rejects.toBeInstanceOf(FatalError);
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
  });

  test("rejects a fact whose points do not match the player's team perspective", async () => {
    const input = {
      groupId: "30000000-0000-4000-8000-000000000001",
      jobId: "30000000-0000-4000-8000-000000000002",
      targetVersion: 8,
      prefixEventCount: 0,
      initialRatings: [],
      history: [{
        id: "30000000-0000-4000-8000-000000000003",
        revisionId: "30000000-0000-4000-8000-000000000004",
        submittedAt: "2026-08-02T00:00:00.000Z",
        format: "singles" as const,
        teamAUserIds: ["30000000-0000-4000-8000-000000000005"],
        teamBUserIds: ["30000000-0000-4000-8000-000000000006"],
        games: [{
          gameId: "30000000-0000-4000-8000-000000000007",
          gameNumber: 1,
          teamAScore: 21,
          teamBScore: 18,
          winnerTeam: "A" as const,
        }],
      }],
    };
    const projection = await calculateProjection(input);
    projection.events[0].pointsFor = 18;

    await expect(applyProjection(input, projection)).rejects.toBeInstanceOf(FatalError);
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
  });

  test("rejects a projection missing a player's final rating state", async () => {
    const input = {
      groupId: "40000000-0000-4000-8000-000000000001",
      jobId: "40000000-0000-4000-8000-000000000002",
      targetVersion: 8,
      prefixEventCount: 0,
      initialRatings: [],
      history: [{
        id: "40000000-0000-4000-8000-000000000003",
        revisionId: "40000000-0000-4000-8000-000000000004",
        submittedAt: "2026-08-02T00:00:00.000Z",
        format: "singles" as const,
        teamAUserIds: ["40000000-0000-4000-8000-000000000005"],
        teamBUserIds: ["40000000-0000-4000-8000-000000000006"],
        games: [{
          gameId: "40000000-0000-4000-8000-000000000007",
          gameNumber: 1,
          teamAScore: 21,
          teamBScore: 18,
          winnerTeam: "A" as const,
        }],
      }],
    };
    const projection = await calculateProjection(input);
    projection.ratings.pop();

    await expect(applyProjection(input, projection)).rejects.toBeInstanceOf(FatalError);
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
  });

  test("reloads the coalesced boundary after a stale apply", async () => {
    const firstInput = {
      groupId: "group-1",
      jobId: "job-1",
      targetVersion: 8,
      prefixEventCount: 6,
      initialRatings: [],
      history: [],
    };
    const reloadedInput = {
      ...firstInput,
      targetVersion: 9,
      prefixEventCount: 4,
    };
    supabaseMocks.rpc
      .mockResolvedValueOnce({ data: firstInput, error: null })
      .mockResolvedValueOnce({ data: { status: "stale", targetVersion: 9 }, error: null })
      .mockResolvedValueOnce({ data: reloadedInput, error: null })
      .mockResolvedValueOnce({ data: { status: "completed" }, error: null });

    await expect(rebuildGroupRatingsWorkflow("job-1", "dispatch-1")).resolves.toEqual({
      status: "completed",
    });

    expect(supabaseMocks.rpc).toHaveBeenNthCalledWith(3, "begin_incremental_rating_rebuild", {
      p_job_id: "job-1",
      p_dispatch_token: "dispatch-1",
    });
    expect(supabaseMocks.rpc).toHaveBeenNthCalledWith(4, "apply_incremental_rating_rebuild", {
      p_job_id: "job-1",
      p_expected_version: 9,
      p_prefix_event_count: 4,
      p_ratings: [],
      p_events: [],
    });
  });

  test("persists a serialized step error message", async () => {
    supabaseMocks.rpc
      .mockResolvedValueOnce({ data: null, error: { message: "winnerTeam is required" } })
      .mockResolvedValueOnce({ data: null, error: null });

    await expect(rebuildGroupRatingsWorkflow("job-1", "dispatch-1")).rejects.toThrow(
      "winnerTeam is required",
    );

    expect(supabaseMocks.rpc).toHaveBeenLastCalledWith("fail_rating_rebuild", {
      p_job_id: "job-1",
      p_error: "winnerTeam is required",
    });
  });

  test("persists a serialized step error cause message", async () => {
    supabaseMocks.rpc
      .mockResolvedValueOnce({ data: null, error: { cause: { message: "rating service unavailable" } } })
      .mockResolvedValueOnce({ data: null, error: null });

    await expect(rebuildGroupRatingsWorkflow("job-1", "dispatch-1")).rejects.toThrow(
      "rating service unavailable",
    );

    expect(supabaseMocks.rpc).toHaveBeenLastCalledWith("fail_rating_rebuild", {
      p_job_id: "job-1",
      p_error: "rating service unavailable",
    });
  });

  test("persists the leaf message from an exhausted serialized step failure", async () => {
    supabaseMocks.rpc
      .mockResolvedValueOnce({
        data: null,
        error: {
          message:
            'Step "loadRebuildInput" failed after 3 retries: {"message":"RPC request failed","cause":"{\\"message\\":\\"rating service unavailable\\"}"}',
        },
      })
      .mockResolvedValueOnce({ data: null, error: null });

    await expect(rebuildGroupRatingsWorkflow("job-1", "dispatch-1")).rejects.toThrow(
      "rating service unavailable",
    );

    expect(supabaseMocks.rpc).toHaveBeenLastCalledWith("fail_rating_rebuild", {
      p_job_id: "job-1",
      p_error: "rating service unavailable",
    });
  });

  test("marks invalid historical input as fatal so the calculation step is not retried", async () => {
    const malformedInput = {
      groupId: "group-1",
      jobId: "job-1",
      targetVersion: 8,
      prefixEventCount: 0,
      initialRatings: [],
      history: [
        {
          id: "match-1",
          revisionId: "revision-1",
          submittedAt: "2026-08-01T00:00:00.000Z",
          format: "singles",
          teamAUserIds: ["player-a"],
          teamBUserIds: ["player-b"],
          games: [{ teamAScore: 21, teamBScore: 18 }],
        },
      ],
    };

    await expect(calculateProjection(malformedInput as never)).rejects.toBeInstanceOf(FatalError);
  });

  test("marks invalid seeded rating input as fatal", async () => {
    await expect(calculateProjection({
      groupId: "group-1",
      jobId: "job-1",
      targetVersion: 8,
      prefixEventCount: 6,
      initialRatings: [
        { userId: "alice", rating: "invalid", rd: 120, volatility: 0.06, gamesPlayed: 3 },
      ],
      history: [],
    } as never)).rejects.toBeInstanceOf(FatalError);
  });

  test("leaves transient RPC failures retryable", async () => {
    supabaseMocks.rpc.mockResolvedValue({ data: null, error: new Error("network timeout") });

    await expect(loadRebuildInput("job-1", "dispatch-1")).rejects.not.toBeInstanceOf(FatalError);
    await expect(
      applyProjection(
        {
          groupId: "group-1",
          jobId: "job-1",
          targetVersion: 8,
          prefixEventCount: 0,
          initialRatings: [],
          history: [],
        },
        { ratings: [], events: [] },
      ),
    ).rejects.not.toBeInstanceOf(FatalError);
  });
});
