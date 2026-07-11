import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { updateSession } from "./proxy";

const auth = vi.hoisted(() => ({
  getClaims: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ auth })),
}));

vi.mock("./env", () => ({
  getSupabasePublicEnv: vi.fn(() => ({
    url: "https://supabase.example.com",
    publishableKey: "publishable-key",
  })),
}));

function request(path: string) {
  return new NextRequest("https://matches.example.com" + path);
}

describe("updateSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.getClaims.mockResolvedValue({ data: { claims: null }, error: null });
  });

  test.each([
    "/home",
    "/groups",
    "/groups/group-1/rankings",
    "/matches/review",
    "/profile",
  ])("redirects anonymous protected requests from %s", async (path) => {
    const response = await updateSession(request(path));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://matches.example.com/login");
  });

  test.each(["/", "/login", "/auth/confirm", "/join/invite-token", "/onboarding?invite=invite-token"])(
    "allows anonymous public requests to %s",
    async (path) => {
      const response = await updateSession(request(path));

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    },
  );

  test("allows authenticated protected requests", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });

    const response = await updateSession(request("/home"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  test("treats authentication errors as anonymous sessions", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: null }, error: new Error("Invalid session") });

    const response = await updateSession(request("/home"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://matches.example.com/login");
  });
});
