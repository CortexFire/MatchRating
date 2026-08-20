import { afterEach, describe, expect, test, vi } from "vitest";
import { getRequiredSupabaseServiceEnv } from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Supabase service environment", () => {
  test("requires only the URL and one accepted service key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.com");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "secret-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    expect(getRequiredSupabaseServiceEnv()).toEqual({
      url: "https://supabase.example.com",
      secretKey: "secret-key",
    });
  });

  test("accepts the legacy service-role key fallback", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.com");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");

    expect(getRequiredSupabaseServiceEnv().secretKey).toBe("service-role-key");
  });
});
