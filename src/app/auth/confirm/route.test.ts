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

const cookieMocks = vi.hoisted(() => {
  const store = { get: vi.fn() };
  return { cookies: vi.fn(async () => store), store };
});

vi.mock("@/lib/supabase/server", () => supabaseMocks);
vi.mock("next/headers", () => cookieMocks);

describe("auth confirm route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMocks.auth.exchangeCodeForSession.mockResolvedValue({ error: null });
    supabaseMocks.auth.verifyOtp.mockResolvedValue({ error: null });
  });

  test("exchanges an OAuth code and redirects to the requested app path", async () => {
    const response = await GET(
      new Request("https://matches.example.com/auth/confirm?code=oauth-code&next=/onboarding"),
    );

    expect(supabaseMocks.auth.exchangeCodeForSession).toHaveBeenCalledWith("oauth-code");
    expect(cookieMocks.cookies).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://matches.example.com/onboarding");
  });

  test("gives OAuth code callbacks precedence over extraneous token callback parameters", async () => {
    const response = await GET(
      new Request("https://matches.example.com/auth/confirm?code=oauth-code&token_hash=hash-value&type=email&next=/onboarding"),
    );

    expect(response.headers.get("location")).toBe("https://matches.example.com/onboarding");
    expect(supabaseMocks.auth.exchangeCodeForSession).toHaveBeenCalledWith("oauth-code");
    expect(supabaseMocks.auth.verifyOtp).not.toHaveBeenCalled();
    expect(cookieMocks.cookies).not.toHaveBeenCalled();
  });

  test("verifies an email token hash with a matching HTTPS callback intent and consumes its cookie", async () => {
    const intent = "A".repeat(43);
    cookieMocks.store.get.mockReturnValue({ value: intent });

    const response = await GET(
      new Request(`https://matches.example.com/auth/confirm?token_hash=hash-value&type=email&auth_intent=${intent}&next=/onboarding`),
    );

    expect(cookieMocks.store.get).toHaveBeenCalledWith("__Host-matchrating-auth-intent");
    expect(supabaseMocks.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: "hash-value",
      type: "email",
    });
    expect(response.headers.get("location")).toBe("https://matches.example.com/onboarding");
    expect(response.headers.get("set-cookie")).toContain("__Host-matchrating-auth-intent=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=lax");
  });

  test("rejects a mismatched callback intent before creating a Supabase client and preserves its cookie", async () => {
    cookieMocks.store.get.mockReturnValue({ value: "A".repeat(43) });

    const response = await GET(
      new Request(`https://matches.example.com/auth/confirm?token_hash=hash-value&type=email&auth_intent=${"B".repeat(43)}&next=/onboarding`),
    );

    expect(response.headers.get("location")).toBe("https://matches.example.com/login?error=auth_callback_failed");
    expect(supabaseMocks.createSupabaseServerClient).not.toHaveBeenCalled();
    expect(supabaseMocks.auth.verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  test("rejects a missing callback intent before creating a Supabase client", async () => {
    cookieMocks.store.get.mockReturnValue({ value: "A".repeat(43) });

    const response = await GET(
      new Request("https://matches.example.com/auth/confirm?token_hash=hash-value&type=email&next=/onboarding"),
    );

    expect(response.headers.get("location")).toBe("https://matches.example.com/login?error=auth_callback_failed");
    expect(supabaseMocks.createSupabaseServerClient).not.toHaveBeenCalled();
    expect(supabaseMocks.auth.verifyOtp).not.toHaveBeenCalled();
  });

  test("consumes a matching callback intent when Supabase rejects the token", async () => {
    const intent = "A".repeat(43);
    cookieMocks.store.get.mockReturnValue({ value: intent });
    supabaseMocks.auth.verifyOtp.mockResolvedValue({ error: new Error("Expired token") });

    const response = await GET(
      new Request(`https://matches.example.com/auth/confirm?token_hash=hash-value&type=email&auth_intent=${intent}&next=/onboarding`),
    );

    expect(response.headers.get("location")).toBe("https://matches.example.com/login?error=auth_callback_failed");
    expect(response.headers.get("set-cookie")).toContain("__Host-matchrating-auth-intent=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=lax");
  });

  test("rejects unsafe external next URLs", async () => {
    const response = await GET(
      new Request("https://matches.example.com/auth/confirm?code=oauth-code&next=https://evil.example.com"),
    );

    expect(response.headers.get("location")).toBe("https://matches.example.com/onboarding");
  });

  test("falls back from encoded path delimiter next URLs", async () => {
    const response = await GET(
      new Request("https://matches.example.com/auth/confirm?code=oauth-code&next=/%252fevil.example.com"),
    );

    expect(response.headers.get("location")).toBe("https://matches.example.com/onboarding");
  });
  test("preserves safe onboarding invite next paths", async () => {
    const response = await GET(
      new Request("https://matches.example.com/auth/confirm?code=oauth-code&next=/onboarding?invite=invite-token"),
    );

    expect(response.headers.get("location")).toBe("https://matches.example.com/onboarding?invite=invite-token");
  });

  test("redirects callback failures back to login", async () => {
    supabaseMocks.auth.exchangeCodeForSession.mockResolvedValue({
      error: new Error("Invalid auth code"),
    });

    const response = await GET(
      new Request("https://matches.example.com/auth/confirm?code=bad-code&next=/onboarding"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://matches.example.com/login?error=auth_callback_failed",
    );
  });
});
