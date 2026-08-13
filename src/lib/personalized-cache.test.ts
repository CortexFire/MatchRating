import { beforeEach, describe, expect, test, vi } from "vitest";
import { getPrivateCurrentProfile, getPrivateGroupMetadata } from "./personalized-cache";

const mocks = vi.hoisted(() => ({
  canCurrentUserReadGroup: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
  requireUserId: vi.fn(),
}));

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));

vi.mock("@/lib/app-data", () => ({
  canCurrentUserReadGroup: mocks.canCurrentUserReadGroup,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: mocks.createSupabaseServiceClient,
  requireUserId: mocks.requireUserId,
}));

describe("personalized private cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("does not read cached group metadata when fresh authorization fails", async () => {
    mocks.canCurrentUserReadGroup.mockResolvedValue(false);
    mocks.createSupabaseServiceClient.mockImplementation(() => {
      throw new Error("group metadata must not be read");
    });

    await expect(getPrivateGroupMetadata("group-1")).resolves.toBeNull();
  });

  test("returns only non-roster metadata after a fresh authorization check", async () => {
    mocks.canCurrentUserReadGroup.mockResolvedValue(true);
    mocks.createSupabaseServiceClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: async () => ({
                data: { id: "group-1", name: "Wednesday Club", description: "Weekly ladder" },
                error: null,
              }),
            }),
          }),
        }),
      }),
    });

    await expect(getPrivateGroupMetadata("group-1")).resolves.toEqual({
      id: "group-1",
      name: "Wednesday Club",
      description: "Weekly ladder",
    });
  });

  test("returns the current profile through the private identity cache", async () => {
    mocks.requireUserId.mockResolvedValue("user-1");
    mocks.createSupabaseServiceClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { id: "user-1", display_name: "Alice Tan" },
              error: null,
            }),
          }),
        }),
      }),
    });

    await expect(getPrivateCurrentProfile()).resolves.toEqual({
      id: "user-1",
      name: "Alice Tan",
      initials: "AT",
    });
  });
});
