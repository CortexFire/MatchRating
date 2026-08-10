import { describe, expect, test } from "vitest";
import {
  createAuthCallbackIntent,
  getAuthCallbackIntentCookie,
  matchesAuthCallbackIntent,
} from "./callback-intent";

describe("auth callback intents", () => {
  test("creates distinct 32-byte URL-safe intents", () => {
    const first = createAuthCallbackIntent();
    const second = createAuthCallbackIntent();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
  });

  test("matches only identical fixed-length URL-safe intents", () => {
    const expected = "A".repeat(43);

    expect(matchesAuthCallbackIntent(expected, expected)).toBe(true);
    expect(matchesAuthCallbackIntent(expected, `${"A".repeat(42)}B`)).toBe(false);
    expect(matchesAuthCallbackIntent(expected, "A".repeat(42))).toBe(false);
    expect(matchesAuthCallbackIntent(expected, `${"A".repeat(42)}+`)).toBe(false);
    expect(matchesAuthCallbackIntent("A".repeat(42), "A".repeat(42))).toBe(false);
  });

  test("defines the host-only HTTPS intent cookie", () => {
    expect(getAuthCallbackIntentCookie(true)).toEqual({
      name: "__Host-matchrating-auth-intent",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 3600,
      secure: true,
    });
  });

  test("defines the local HTTP intent cookie", () => {
    expect(getAuthCallbackIntentCookie(false)).toEqual({
      name: "matchrating-auth-intent",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 3600,
      secure: false,
    });
  });
});
