import { expect, test, vi } from "vitest";
import {
  ALLOW_EXTERNAL_SUPABASE_ENV,
  getE2EServerEnvironment,
  parseSupabaseStatusEnvironment,
  resolveProjectBinary,
} from "../scripts/start-e2e-server.mjs";

test("parses quoted local Supabase status values", () => {
  expect(
    parseSupabaseStatusEnvironment(
      'export API_URL="http://127.0.0.1:54321"\nPUBLISHABLE_KEY=public-key\nSECRET_KEY=\'secret-key\'\n',
    ),
  ).toEqual(
    new Map([
      ["API_URL", "http://127.0.0.1:54321"],
      ["PUBLISHABLE_KEY", "public-key"],
      ["SECRET_KEY", "secret-key"],
    ]),
  );
});

test("uses local Supabase values unless external access is explicitly enabled", () => {
  const readLocalStatus = vi.fn(
    () => 'API_URL="http://127.0.0.1:54321"\nPUBLISHABLE_KEY="local-public"\nSECRET_KEY="local-secret"\n',
  );

  const environment = getE2EServerEnvironment(
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://remote.example.com",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "remote-public",
      SUPABASE_SECRET_KEY: "remote-secret",
    },
    readLocalStatus,
  );

  expect(readLocalStatus).toHaveBeenCalledOnce();
  expect(environment).toMatchObject({
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-public",
    SUPABASE_SECRET_KEY: "local-secret",
    DEMO_LOGIN_ENABLED: "true",
  });
});

test("uses complete caller-supplied Supabase values only with the explicit opt-in", () => {
  const readLocalStatus = vi.fn();

  const environment = getE2EServerEnvironment(
    {
      [ALLOW_EXTERNAL_SUPABASE_ENV]: "true",
      NEXT_PUBLIC_SUPABASE_URL: "https://remote.example.com",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "remote-public",
      SUPABASE_SECRET_KEY: "remote-secret",
    },
    readLocalStatus,
  );

  expect(readLocalStatus).not.toHaveBeenCalled();
  expect(environment).toMatchObject({
    NEXT_PUBLIC_SUPABASE_URL: "https://remote.example.com",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "remote-public",
    SUPABASE_SECRET_KEY: "remote-secret",
  });
});

test("rejects incomplete opted-in external configuration", () => {
  expect(() =>
    getE2EServerEnvironment(
      { [ALLOW_EXTERNAL_SUPABASE_ENV]: "true", NEXT_PUBLIC_SUPABASE_URL: "https://remote.example.com" },
      vi.fn(),
    ),
  ).toThrow(`${ALLOW_EXTERNAL_SUPABASE_ENV}=true requires`);
});

test("resolves the pinned local Supabase and Next executables", () => {
  expect(resolveProjectBinary("supabase")).toMatch(/node_modules[\\/]supabase[\\/]dist[\\/]supabase\.js$/);
  expect(resolveProjectBinary("next")).toMatch(/node_modules[\\/]next[\\/]dist[\\/]bin[\\/]next$/);
});
