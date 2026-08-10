import { beforeEach, describe, expect, test, vi } from "vitest";
import { markFailed } from "./rebuild-group-ratings";

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
});
