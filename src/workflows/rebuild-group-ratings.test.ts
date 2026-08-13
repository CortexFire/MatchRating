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

  test("leaves transient RPC failures retryable", async () => {
    supabaseMocks.rpc.mockResolvedValue({ data: null, error: new Error("network timeout") });

    await expect(loadRebuildInput("job-1", "dispatch-1")).rejects.not.toBeInstanceOf(FatalError);
    await expect(
      applyProjection(
        { groupId: "group-1", jobId: "job-1", targetVersion: 8, history: [] },
        { ratings: [], events: [] },
      ),
    ).rejects.not.toBeInstanceOf(FatalError);
  });
});
