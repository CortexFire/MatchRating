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

function canonicalSinglesInput() {
  return {
    groupId: "50000000-0000-4000-8000-000000000001",
    jobId: "50000000-0000-4000-8000-000000000002",
    targetVersion: 8,
    prefixEventCount: 10,
    prefixConsistencyEventCount: 5,
    initialRatings: [],
    history: [{
      id: "50000000-0000-4000-8000-000000000003",
      revisionId: "50000000-0000-4000-8000-000000000004",
      submittedAt: "2026-08-02T00:00:00.000Z",
      format: "singles" as const,
      teamAUserIds: ["50000000-0000-4000-8000-000000000005"],
      teamBUserIds: ["50000000-0000-4000-8000-000000000006"],
      games: [
        {
          gameId: "50000000-0000-4000-8000-000000000007",
          gameNumber: 1,
          teamAScore: 18,
          teamBScore: 21,
          winnerTeam: "B" as const,
        },
        {
          gameId: "50000000-0000-4000-8000-000000000008",
          gameNumber: 2,
          teamAScore: 21,
          teamBScore: 17,
          winnerTeam: "A" as const,
        },
        {
          gameId: "50000000-0000-4000-8000-000000000009",
          gameNumber: 3,
          teamAScore: 21,
          teamBScore: 19,
          winnerTeam: "A" as const,
        },
      ],
    }],
  };
}

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
      prefixConsistencyEventCount: 3,
      initialRatings: [
        {
          userId: "alice",
          rating: 1510,
          rd: 120,
          volatility: 0.06,
          gamesPlayed: 3,
          logKappaMean: Math.log(180),
          logKappaVariance: 0.08,
          consistencyMatchesPlayed: 2,
        },
      ],
      history: [],
    };
    supabaseMocks.rpc.mockResolvedValue({ data: input, error: null });

    await expect(loadRebuildInput("job-1", "dispatch-1")).resolves.toEqual(input);
    expect(supabaseMocks.rpc).toHaveBeenCalledWith("begin_incremental_rating_rebuild_v2", {
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
      prefixConsistencyEventCount: 3,
      initialRatings: [
        { userId: "alice", rating: 1510, rd: 120, volatility: 0.06, gamesPlayed: 3, logKappaMean: Math.log(180), logKappaVariance: 0.08, consistencyMatchesPlayed: 2 },
        { userId: "bea", rating: 1490, rd: 130, volatility: 0.06, gamesPlayed: 3, logKappaMean: Math.log(220), logKappaVariance: 0.09, consistencyMatchesPlayed: 2 },
        { userId: "prefix-only", rating: 1600, rd: 100, volatility: 0.05, gamesPlayed: 5, logKappaMean: Math.log(160), logKappaVariance: 0.07, consistencyMatchesPlayed: 4 },
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
    expect(projection.consistencyEvents.map((event) => event.sequence)).toEqual([4, 5]);
    expect(projection.ratings).toContainEqual(expect.objectContaining({
      userId: "prefix-only",
      rating: 1600,
      gamesPlayed: 5,
      logKappaMean: Math.log(160),
      consistencyMatchesPlayed: 4,
    }));
  });

  test("applies a suffix with its preserved prefix count", async () => {
    const input = {
      groupId: "group-1",
      jobId: "job-1",
      targetVersion: 8,
      prefixEventCount: 6,
      prefixConsistencyEventCount: 3,
      initialRatings: [],
      history: [],
    };
    supabaseMocks.rpc.mockResolvedValue({ data: { status: "completed" }, error: null });

    await expect(applyProjection(input, { ratings: [], events: [], consistencyEvents: [] })).resolves.toEqual({
      status: "completed",
    });
    expect(supabaseMocks.rpc).toHaveBeenCalledWith("apply_incremental_rating_rebuild_v2", {
      p_job_id: "job-1",
      p_expected_version: 8,
      p_prefix_event_count: 6,
      p_prefix_consistency_event_count: 3,
      p_ratings: [],
      p_events: [],
      p_consistency_events: [],
    });
  });

  test("rejects a nonfinite expected score before applying the suffix", async () => {
    const input = {
      groupId: "10000000-0000-4000-8000-000000000001",
      jobId: "10000000-0000-4000-8000-000000000002",
      targetVersion: 8,
      prefixEventCount: 0,
      prefixConsistencyEventCount: 0,
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
      prefixConsistencyEventCount: 0,
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
      prefixConsistencyEventCount: 0,
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
      prefixConsistencyEventCount: 0,
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

  test("rejects an invalid consistency prefix count before calculation", async () => {
    await expect(calculateProjection({
      ...canonicalSinglesInput(),
      prefixConsistencyEventCount: -1,
    })).rejects.toBeInstanceOf(FatalError);
  });

  test.each([
    ["mean", { logKappaMean: Number.NaN, logKappaVariance: 0.1, consistencyMatchesPlayed: 2 }],
    ["variance", { logKappaMean: Math.log(200), logKappaVariance: 0, consistencyMatchesPlayed: 2 }],
    ["count", { logKappaMean: Math.log(200), logKappaVariance: 0.1, consistencyMatchesPlayed: -1 }],
  ])("rejects an invalid seeded consistency %s before calculation", async (_, consistency) => {
    await expect(calculateProjection({
      ...canonicalSinglesInput(),
      initialRatings: [{
        userId: "50000000-0000-4000-8000-000000000005",
        rating: 1500,
        rd: 120,
        volatility: 0.06,
        gamesPlayed: 3,
        ...consistency,
      }],
    })).rejects.toBeInstanceOf(FatalError);
  });

  test.each([
    ["invalid UUID", (projection: Awaited<ReturnType<typeof calculateProjection>>) => {
      projection.consistencyEvents[0].matchId = "not-a-uuid";
    }],
    ["nonfinite expectation", (projection: Awaited<ReturnType<typeof calculateProjection>>) => {
      projection.consistencyEvents[0].expectedScore = Number.NaN;
    }],
    ["noncomplementary expectation", (projection: Awaited<ReturnType<typeof calculateProjection>>) => {
      projection.consistencyEvents[0].expectedScore = 0.25;
    }],
    ["wrong chronology", (projection: Awaited<ReturnType<typeof calculateProjection>>) => {
      projection.consistencyEvents[0].occurredAt = "2026-08-03T00:00:00.000Z";
    }],
    ["wrong team", (projection: Awaited<ReturnType<typeof calculateProjection>>) => {
      projection.consistencyEvents[0].team = "B";
    }],
    ["wrong format", (projection: Awaited<ReturnType<typeof calculateProjection>>) => {
      projection.consistencyEvents[0].format = "doubles";
    }],
    ["wrong match result", (projection: Awaited<ReturnType<typeof calculateProjection>>) => {
      projection.consistencyEvents[0].actualScore = 0;
    }],
    ["wrong sequence", (projection: Awaited<ReturnType<typeof calculateProjection>>) => {
      projection.consistencyEvents[0].sequence += 1;
    }],
    ["invalid before state", (projection: Awaited<ReturnType<typeof calculateProjection>>) => {
      projection.consistencyEvents[0].before.logKappaVariance = 0;
    }],
    ["invalid matches-played transition", (projection: Awaited<ReturnType<typeof calculateProjection>>) => {
      projection.consistencyEvents[0].after.matchesPlayed = projection.consistencyEvents[0].before.matchesPlayed;
    }],
  ])("rejects a consistency event with %s before applying", async (_, mutate) => {
    const input = canonicalSinglesInput();
    const projection = await calculateProjection(input);
    mutate(projection);

    await expect(applyProjection(input, projection)).rejects.toBeInstanceOf(FatalError);
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
  });

  test("rejects duplicate consistency facts before applying", async () => {
    const input = canonicalSinglesInput();
    const projection = await calculateProjection(input);
    projection.consistencyEvents.push({
      ...structuredClone(projection.consistencyEvents[0]),
      sequence: input.prefixConsistencyEventCount + 3,
    });

    await expect(applyProjection(input, projection)).rejects.toBeInstanceOf(FatalError);
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
  });

  test("rejects an incomplete consistency event set before applying", async () => {
    const input = canonicalSinglesInput();
    const projection = await calculateProjection(input);
    projection.consistencyEvents.pop();

    await expect(applyProjection(input, projection)).rejects.toBeInstanceOf(FatalError);
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
  });

  test("rejects an invalid final consistency state before applying", async () => {
    const input = canonicalSinglesInput();
    const projection = await calculateProjection(input);
    projection.ratings[0].logKappaVariance = 0;

    await expect(applyProjection(input, projection)).rejects.toBeInstanceOf(FatalError);
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
  });

  test("reloads the coalesced boundary after a stale apply", async () => {
    const firstInput = {
      groupId: "group-1",
      jobId: "job-1",
      targetVersion: 8,
      prefixEventCount: 6,
      prefixConsistencyEventCount: 3,
      initialRatings: [],
      history: [],
    };
    const reloadedInput = {
      ...firstInput,
      targetVersion: 9,
      prefixEventCount: 4,
      prefixConsistencyEventCount: 2,
    };
    supabaseMocks.rpc
      .mockResolvedValueOnce({ data: firstInput, error: null })
      .mockResolvedValueOnce({ data: { status: "stale", targetVersion: 9 }, error: null })
      .mockResolvedValueOnce({ data: reloadedInput, error: null })
      .mockResolvedValueOnce({ data: { status: "completed" }, error: null });

    await expect(rebuildGroupRatingsWorkflow("job-1", "dispatch-1")).resolves.toEqual({
      status: "completed",
    });

    expect(supabaseMocks.rpc).toHaveBeenNthCalledWith(3, "begin_incremental_rating_rebuild_v2", {
      p_job_id: "job-1",
      p_dispatch_token: "dispatch-1",
    });
    expect(supabaseMocks.rpc).toHaveBeenNthCalledWith(4, "apply_incremental_rating_rebuild_v2", {
      p_job_id: "job-1",
      p_expected_version: 9,
      p_prefix_event_count: 4,
      p_prefix_consistency_event_count: 2,
      p_ratings: [],
      p_events: [],
      p_consistency_events: [],
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
      prefixConsistencyEventCount: 0,
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
      prefixConsistencyEventCount: 3,
      initialRatings: [
        { userId: "alice", rating: "invalid", rd: 120, volatility: 0.06, gamesPlayed: 3, logKappaMean: Math.log(200), logKappaVariance: 0.1, consistencyMatchesPlayed: 2 },
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
          prefixConsistencyEventCount: 0,
          initialRatings: [],
          history: [],
        },
        { ratings: [], events: [], consistencyEvents: [] },
      ),
    ).rejects.not.toBeInstanceOf(FatalError);
  });
});
