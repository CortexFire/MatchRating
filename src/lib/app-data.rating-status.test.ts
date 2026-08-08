import { beforeEach, describe, expect, test, vi } from "vitest";
import { getGroupRatingRebuildStatus } from "./app-data";

const supabaseMocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
  requireUserId: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => supabaseMocks);

describe("getGroupRatingRebuildStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMocks.createSupabaseServerClient.mockResolvedValue({ rpc: supabaseMocks.rpc });
  });

  test("returns the job ID, persisted status, and retry permission", async () => {
    supabaseMocks.rpc.mockResolvedValue({
      data: {
        id: "44444444-4444-4444-8444-444444444444",
        status: "failed",
        canRetry: true,
      },
      error: null,
    });

    await expect(getGroupRatingRebuildStatus("66666666-6666-4666-8666-666666666666")).resolves.toEqual({
      id: "44444444-4444-4444-8444-444444444444",
      status: "failed",
      canRetry: true,
    });
  });

  test("returns an empty status when the group has no rating job", async () => {
    supabaseMocks.rpc.mockResolvedValue({ data: { status: null, canRetry: false }, error: null });

    await expect(getGroupRatingRebuildStatus("66666666-6666-4666-8666-666666666666")).resolves.toEqual({
      id: null,
      status: null,
      canRetry: false,
    });
  });
});
