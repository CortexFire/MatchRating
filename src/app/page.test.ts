import { beforeEach, describe, expect, test, vi } from "vitest";
import Home from "./page";
import { redirect } from "next/navigation";

const authMock = vi.hoisted(() => ({
  getClaims: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: authMock })),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

describe("root page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("redirects unauthenticated users to login", async () => {
    authMock.getClaims.mockResolvedValue({ data: { claims: null }, error: null });

    await expect(Home()).rejects.toThrow("NEXT_REDIRECT:/login");

    expect(redirect).toHaveBeenCalledWith("/login");
  });

  test("redirects authenticated users to home", async () => {
    authMock.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });

    await expect(Home()).rejects.toThrow("NEXT_REDIRECT:/home");

    expect(redirect).toHaveBeenCalledWith("/home");
  });
});