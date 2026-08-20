import { beforeEach, describe, expect, test, vi } from "vitest";
import { dispatchRecoverableRatingJobs } from "./rebuild-dispatch";

const workflowMocks = vi.hoisted(() => ({ start: vi.fn() }));
const supabaseMocks = vi.hoisted(() => ({ createSupabaseServiceClient: vi.fn() }));

vi.mock("workflow/api", () => workflowMocks);
vi.mock("@/lib/supabase/server", () => supabaseMocks);

function recoveryQuery() {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    or: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(async () => ({
      data: [{ id: "job-1" }, { id: "job-2" }],
      error: null,
    })),
  };
  return { from: vi.fn(() => query) };
}

function claimedJob(error: { message: string } | null) {
  const update = {
    update: vi.fn(() => update),
    eq: vi.fn(() => update),
  };
  return {
    rpc: vi.fn(async () => ({ data: error ? null : true, error })),
    from: vi.fn(() => update),
  };
}

describe("dispatchRecoverableRatingJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("continues dispatching when one recoverable job fails", async () => {
    const services = [
      recoveryQuery(),
      claimedJob({ message: "claim failed" }),
      claimedJob(null),
    ];
    supabaseMocks.createSupabaseServiceClient.mockImplementation(() => services.shift());
    workflowMocks.start.mockResolvedValue({ runId: "run-2" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(dispatchRecoverableRatingJobs()).resolves.toEqual([null, "run-2"]);
    expect(workflowMocks.start).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith("rating_dispatch_recovery_failed", {
      jobId: "job-1",
      error: "claim failed",
    });
    errorSpy.mockRestore();
  });

  test("can suppress identifier-bearing recovery logs for aggregate-only tooling", async () => {
    const services = [
      recoveryQuery(),
      claimedJob({ message: "claim failed" }),
      claimedJob(null),
    ];
    supabaseMocks.createSupabaseServiceClient.mockImplementation(() => services.shift());
    workflowMocks.start.mockResolvedValue({ runId: "run-2" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(dispatchRecoverableRatingJobs(25, { logErrors: false })).resolves.toEqual([
      null,
      "run-2",
    ]);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
