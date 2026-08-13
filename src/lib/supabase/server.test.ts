import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  requireAuthenticatedSupabaseClient,
  requireUserId,
} from "./server";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getClaims: vi.fn(),
  cookieGetAll: vi.fn(() => []),
  cookieSet: vi.fn(),
  cacheGeneration: 0,
}));

vi.mock("react", () => ({
  cache: <Args extends unknown[], Result>(fn: (...args: Args) => Result) => {
    let result: Result | undefined;
    let generation = -1;
    return (...args: Args) => {
      if (generation !== mocks.cacheGeneration) {
        result = undefined;
        generation = mocks.cacheGeneration;
      }
      result ??= fn(...args);
      return result;
    };
  },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll: mocks.cookieGetAll,
    set: mocks.cookieSet,
  })),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("./env", () => ({
  getRequiredSupabasePublicEnv: vi.fn(() => ({
    url: "https://supabase.example.com",
    publishableKey: "publishable-key",
  })),
  getRequiredSupabaseSecretKey: vi.fn(() => "secret-key"),
}));

describe("server authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cacheGeneration += 1;
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "user-1" } },
      error: null,
    });
    mocks.createServerClient.mockReturnValue({ auth: { getClaims: mocks.getClaims } });
  });

  test("shares one claims validation and Supabase client across concurrent identity consumers", async () => {
    const [context, firstUserId, secondUserId] = await Promise.all([
      requireAuthenticatedSupabaseClient(),
      requireUserId(),
      requireUserId(),
    ]);

    expect(firstUserId).toBe("user-1");
    expect(secondUserId).toBe("user-1");
    expect(context.userId).toBe("user-1");
    expect(context.client).toBe(mocks.createServerClient.mock.results[0]?.value);
    expect(mocks.createServerClient).toHaveBeenCalledTimes(1);
    expect(mocks.getClaims).toHaveBeenCalledTimes(1);
  });

  test("rejects missing claims", async () => {
    mocks.getClaims.mockResolvedValueOnce({ data: { claims: null }, error: null });

    await expect(requireAuthenticatedSupabaseClient()).rejects.toThrow(
      "You must be signed in to do that.",
    );
  });
});
