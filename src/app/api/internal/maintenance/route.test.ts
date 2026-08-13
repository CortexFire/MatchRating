import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  dispatchRecoverableRatingJobs: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  draftDelete: vi.fn(),
  draftLt: vi.fn(),
  draftIs: vi.fn(),
}));

vi.mock("@/lib/ratings/rebuild-dispatch", () => ({
  dispatchRecoverableRatingJobs: mocks.dispatchRecoverableRatingJobs,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: mocks.createSupabaseServiceClient,
}));

function request(secret = "test-secret") {
  return new Request("https://matches.example.com/api/internal/maintenance", {
    headers: { authorization: `Bearer ${secret}` },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
  const draftQuery = {
    delete: mocks.draftDelete,
    lt: mocks.draftLt,
    is: mocks.draftIs,
  };
  mocks.draftDelete.mockReturnValue(draftQuery);
  mocks.draftLt.mockReturnValue(draftQuery);
  mocks.draftIs.mockResolvedValue({ error: null });
  mocks.from.mockReturnValue(draftQuery);
  mocks.rpc.mockResolvedValue({ data: 2, error: null });
  mocks.createSupabaseServiceClient.mockReturnValue({ from: mocks.from, rpc: mocks.rpc });
  mocks.dispatchRecoverableRatingJobs.mockResolvedValue(["run-1", null]);
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.CRON_SECRET;
});

describe("maintenance route", () => {
  test("rejects requests without the cron secret", async () => {
    const response = await GET(request("wrong"));

    expect(response.status).toBe(401);
    expect(mocks.createSupabaseServiceClient).not.toHaveBeenCalled();
  });

  test("recovers rating jobs, cleans drafts, and auto-accepts expired reviews", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-08-13T10:00:00.000Z");
    vi.setSystemTime(now);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.from.mock.calls).toEqual([["active_match_drafts"]]);
    expect(mocks.draftDelete).toHaveBeenCalledTimes(1);
    expect(mocks.draftDelete).toHaveBeenCalledWith();
    expect(mocks.draftLt.mock.calls).toEqual([["expires_at", now.toISOString()]]);
    expect(mocks.draftIs.mock.calls).toEqual([["submitted_match_id", null]]);
    expect(mocks.dispatchRecoverableRatingJobs).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("auto_accept_expired_match_reviews");
    await expect(response.json()).resolves.toEqual({ dispatched: 1, autoAccepted: 2 });
  });

  test("returns a failing response when automatic acceptance fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } });

    const response = await GET(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ message: "Maintenance failed" });
  });
});
