import { beforeEach, describe, expect, test, vi } from "vitest";
import * as actions from "@/app/actions";

const supabaseMocks = vi.hoisted(() => {
  const auth = {
    signInWithOtp: vi.fn(),
    signInWithOAuth: vi.fn(),
    verifyOtp: vi.fn(),
    admin: {
      generateLink: vi.fn(),
    },
  };
  const table = {
    upsert: vi.fn(),
  };

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

vi.mock("@/lib/supabase/server", () => supabaseMocks);

describe("auth actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = "https://matches.example.com";
    delete process.env.DEMO_LOGIN_ENABLED;
    delete process.env.DEMO_EMAIL_DOMAIN;
    supabaseMocks.auth.signInWithOtp.mockResolvedValue({ error: null });
    supabaseMocks.auth.signInWithOAuth.mockResolvedValue({
      data: { url: "https://supabase.example.com/oauth" },
      error: null,
    });
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
  });

  test("signInWithGoogle starts Google OAuth with the auth callback redirect", async () => {
    const result = await actions.signInWithGoogle();

    expect(result).toEqual({
      ok: true,
      data: { url: "https://supabase.example.com/oauth" },
    });
    expect(supabaseMocks.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://matches.example.com/auth/confirm?next=/groups/new",
      },
    });
  });

  test("signInWithOtp sends the email code with the auth callback redirect", async () => {
    const result = await actions.signInWithOtp("player@example.com");

    expect(result.ok).toBe(true);
    expect(supabaseMocks.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "player@example.com",
      options: {
        emailRedirectTo: "https://matches.example.com/auth/confirm?next=/groups/new",
      },
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
      type: "magiclink",
    });
  });

  test("signInWithOtp sends email for demo addresses when demo login is disabled", async () => {
    const result = await actions.signInWithOtp("alice@demo.matchrating.app");

    expect(result.ok).toBe(true);
    expect(supabaseMocks.auth.admin.generateLink).not.toHaveBeenCalled();
    expect(supabaseMocks.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "alice@demo.matchrating.app",
      options: {
        emailRedirectTo: "https://matches.example.com/auth/confirm?next=/groups/new",
      },
    });
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
  });

  test("auth action errors are returned as user-safe messages", async () => {
    supabaseMocks.auth.signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: new Error("Provider is not enabled"),
    });

    const result = await actions.signInWithGoogle();

    expect(result).toEqual({
      ok: false,
      message: "Provider is not enabled",
    });
  });
});
