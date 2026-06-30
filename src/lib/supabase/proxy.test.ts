import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { updateSession } from "./proxy";

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(),
}));

const createServerClientMock = vi.mocked(createServerClient);

function request(path: string) {
  return new NextRequest(`https://matches.example.com${path}`);
}

describe("updateSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example.com";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";
  });

  test("redirects unauthenticated protected routes to login with next path", async () => {
    createServerClientMock.mockReturnValue({
      auth: { getClaims: vi.fn(async () => ({ data: null, error: new Error("No session") })) },
    } as never);

    const response = await updateSession(
      request("/groups/group-1/matches/new?format=doubles"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://matches.example.com/login?next=%2Fgroups%2Fgroup-1%2Fmatches%2Fnew%3Fformat%3Ddoubles",
    );
  });

  test("allows authenticated protected routes to render", async () => {
    createServerClientMock.mockReturnValue({
      auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: "user-1" } }, error: null })) },
    } as never);

    const response = await updateSession(request("/groups/group-1/matches/new"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  test("does not redirect unauthenticated public routes", async () => {
    createServerClientMock.mockReturnValue({
      auth: { getClaims: vi.fn(async () => ({ data: null, error: new Error("No session") })) },
    } as never);

    const response = await updateSession(request("/login"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
