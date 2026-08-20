import { beforeEach, describe, expect, test, vi } from "vitest";
import * as actions from "@/app/actions";

const supabaseMocks = vi.hoisted(() => {
  const auth = {
    signInWithOtp: vi.fn(),
    verifyOtp: vi.fn(),
    admin: {
      generateLink: vi.fn(),
    },
  };
  const table = {
    upsert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
  };
  table.select.mockReturnValue(table);
  table.update.mockReturnValue(table);
  table.eq.mockReturnValue(table);

  return {
    auth,
    createSupabaseServerClient: vi.fn(async () => ({ auth })),
    createSupabaseServiceClient: vi.fn(() => ({
      auth,
      from: vi.fn(() => table),
    })),
    requireUserId: vi.fn(),
    table,
  };
});

const cookieMocks = vi.hoisted(() => {
  const store = { set: vi.fn() };
  return { cookies: vi.fn(async () => store), store };
});

vi.mock("@/lib/supabase/server", () => supabaseMocks);
vi.mock("next/headers", () => cookieMocks);

describe("auth actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = "https://matches.example.com";
    delete process.env.DEMO_LOGIN_ENABLED;
    delete process.env.DEMO_EMAIL_DOMAIN;
    supabaseMocks.auth.signInWithOtp.mockResolvedValue({ error: null });
    supabaseMocks.auth.verifyOtp.mockResolvedValue({ error: null });
    supabaseMocks.auth.admin.generateLink.mockImplementation(({ email }: { email: string }) =>
      Promise.resolve({
        data: {
          properties: { hashed_token: `hash-${email.split("@")[0]}` },
          user: {
            id: `${email.split("@")[0]}-0000-0000-0000-000000000000`,
            email,
          },
        },
        error: null,
      }),
    );
    supabaseMocks.table.upsert.mockResolvedValue({ error: null });
    supabaseMocks.table.single.mockResolvedValue({ data: { rating_applied_version: 3 }, error: null });
  });


  test("signInWithOtp sends a callback intent and arms its HTTPS cookie after a successful email send", async () => {
    const result = await actions.signInWithOtp("player@example.com");

    expect(result).toEqual({
      ok: true,
      data: { email: "player@example.com" },
      message: "Check your email for the login link.",
    });
    const redirectUrl = new URL(supabaseMocks.auth.signInWithOtp.mock.calls[0]?.[0].options.emailRedirectTo);
    const intent = redirectUrl.searchParams.get("auth_intent");
    expect(redirectUrl.searchParams.get("next")).toBe("/onboarding");
    expect(intent).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookieMocks.store.set).toHaveBeenCalledWith({
      name: "__Host-matchrating-auth-intent",
      value: intent,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 3600,
      secure: true,
    });
  });

  test("signInWithOtp signs demo emails in without sending an email when enabled", async () => {
    process.env.DEMO_LOGIN_ENABLED = "true";

    const result = await actions.signInWithOtp("alice@demo.matchrating.app");

    expect(result).toEqual({
      ok: true,
      data: {
        email: "alice@demo.matchrating.app",
        redirectTo: "/groups/11111111-1111-4111-8111-111111111111",
      },
      message: "Signed in as Alice Tan.",
    });
    expect(supabaseMocks.auth.signInWithOtp).not.toHaveBeenCalled();
    expect(supabaseMocks.auth.admin.generateLink).toHaveBeenCalledTimes(8);
    expect(supabaseMocks.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: "hash-alice",
      type: "email",
    });
    expect(cookieMocks.store.set).not.toHaveBeenCalled();
  });

  test("signInWithOtp sends email for demo addresses when demo login is disabled", async () => {
    const result = await actions.signInWithOtp("alice@demo.matchrating.app");

    expect(result.ok).toBe(true);
    expect(supabaseMocks.auth.admin.generateLink).not.toHaveBeenCalled();
    const redirectUrl = new URL(supabaseMocks.auth.signInWithOtp.mock.calls[0]?.[0].options.emailRedirectTo);
    expect(redirectUrl.searchParams.get("next")).toBe("/onboarding");
    expect(redirectUrl.searchParams.get("auth_intent")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  test("email auth preserves a safe onboarding invite redirect", async () => {
    await actions.signInWithOtp("player@example.com", "/onboarding?invite=invite-token");

    const redirectUrl = new URL(supabaseMocks.auth.signInWithOtp.mock.calls[0]?.[0].options.emailRedirectTo);
    expect(redirectUrl.searchParams.get("next")).toBe("/onboarding?invite=invite-token");
  });

  test("signInWithOtp falls back from a malicious next path before issuing its email link", async () => {
    await actions.signInWithOtp("player@example.com", "//evil.example.com");

    const redirectUrl = new URL(supabaseMocks.auth.signInWithOtp.mock.calls[0]?.[0].options.emailRedirectTo);
    expect(redirectUrl.searchParams.get("next")).toBe("/onboarding");
  });

  test("verifyEmailOtp verifies a six-digit email code", async () => {
    const verifyEmailOtp = (
      actions as typeof actions & {
        verifyEmailOtp: (input: { email: string; token: string }) => Promise<actions.ActionResult>;
      }
    ).verifyEmailOtp;

    const result = await verifyEmailOtp({
      email: "player@example.com",
      token: "123456",
    });

    expect(result.ok).toBe(true);
    expect(supabaseMocks.auth.verifyOtp).toHaveBeenCalledWith({
      email: "player@example.com",
      token: "123456",
      type: "email",
    });
    expect(cookieMocks.store.set).toHaveBeenCalledWith({
      name: "__Host-matchrating-auth-intent",
      value: "",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
      secure: true,
    });
  });

  test("verifyEmailOtp rejects incomplete codes before calling Supabase", async () => {
    const verifyEmailOtp = (
      actions as typeof actions & {
        verifyEmailOtp: (input: { email: string; token: string }) => Promise<actions.ActionResult>;
      }
    ).verifyEmailOtp;

    const result = await verifyEmailOtp({
      email: "player@example.com",
      token: "123",
    });

    expect(result).toEqual({
      ok: false,
      message: "Enter the 6-digit code from your email.",
    });
    expect(supabaseMocks.auth.verifyOtp).not.toHaveBeenCalled();
    expect(cookieMocks.store.set).not.toHaveBeenCalled();
  });

  test("auth action errors are returned as user-safe messages", async () => {
    supabaseMocks.auth.signInWithOtp.mockResolvedValue({
      error: new Error("Email provider is unavailable"),
    });

    const result = await actions.signInWithOtp("player@example.com");

    expect(result).toEqual({
      ok: false,
      message: "Email provider is unavailable",
    });
    expect(cookieMocks.store.set).not.toHaveBeenCalled();
  });

  test("signInWithOtp uses login-link copy when an unknown send failure has no message", async () => {
    supabaseMocks.auth.signInWithOtp.mockRejectedValueOnce("provider unavailable");

    const result = await actions.signInWithOtp("player@example.com");

    expect(result).toEqual({
      ok: false,
      message: "Could not send login link.",
    });
    expect(cookieMocks.store.set).not.toHaveBeenCalled();
  });

  test("verifyEmailOtp preserves a pending callback intent when Supabase rejects the code", async () => {
    supabaseMocks.auth.verifyOtp.mockResolvedValue({ error: new Error("Invalid code") });

    const result = await actions.verifyEmailOtp({ email: "player@example.com", token: "123456" });

    expect(result).toEqual({ ok: false, message: "Invalid code" });
    expect(cookieMocks.store.set).not.toHaveBeenCalled();
  });
});
