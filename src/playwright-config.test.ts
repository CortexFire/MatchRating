import { expect, test, vi } from "vitest";

const childProcessMocks = vi.hoisted(() => ({
  execFileSync: vi.fn(() => "API_URL=\"http://127.0.0.1:54321\"\nPUBLISHABLE_KEY=\"public\"\nSECRET_KEY=\"secret\"\n"),
}));

vi.mock("node:child_process", () => childProcessMocks);

import config from "../playwright.config";

test("Playwright defers local Supabase discovery and never reuses a server", () => {
  expect(childProcessMocks.execFileSync).not.toHaveBeenCalled();
  expect(config.webServer).toMatchObject({
    command: "node scripts/start-e2e-server.mjs",
    reuseExistingServer: false,
  });
});
