import { beforeEach, describe, expect, test, vi } from "vitest";
import { GET } from "./route";

const supabaseMocks = vi.hoisted(() => {
  const auth = {
    exchangeCodeForSession: vi.fn(),
    verifyOtp: vi.fn(),
  };

  return {
    auth,
    createSupabaseServerClient: vi.fn(async () => ({ auth })),
  };
});

vi.mock("@/lib/supabase/server", () => supabaseMocks);

describe("auth confirm route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMocks.auth.exchangeCodeForSession.mockResolvedValue({ error: null });
    supabaseMocks.auth.verifyOtp.mockResolvedValue({ error: null });
  });

  test("exchanges an OAuth code and redirects to the requested app path", async () => {
    const response = await GET(
      new Request("https://matches.example.com/auth/confirm?code=oauth-code&next=/groups/new"),
    );

    expect(supabaseMocks.auth.exchangeCodeForSession).toHaveBeenCalledWith("oauth-code");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://matches.example.com/groups/new");
  });

  test("verifies an email token hash and redirects to the requested app path", async () => {
    const response = await GET(
      new Request("https://matches.example.com/auth/confirm?token_hash=hash-value&type=email&next=/groups/new"),
    );

    expect(supabaseMocks.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: "hash-value",
      type: "email",
    });
    expect(response.headers.get("location")).toBe("https://matches.example.com/groups/new");
  });

  test("rejects unsafe external next URLs", async () => {
    const response = await GET(
      new Request("https://matches.example.com/auth/confirm?code=oauth-code&next=https://evil.example.com"),
    );

    expect(response.headers.get("location")).toBe("https://matches.example.com/groups/new");
  });

  test("redirects callback failures back to login", async () => {
    supabaseMocks.auth.exchangeCodeForSession.mockResolvedValue({
      error: new Error("Invalid auth code"),
    });

    const response = await GET(
      new Request("https://matches.example.com/auth/confirm?code=bad-code&next=/groups/new"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://matches.example.com/login?error=auth_callback_failed",
    );
  });
});
