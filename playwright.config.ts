import { execFileSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

function getLocalSupabaseEnvironment() {
  const command = process.platform === "win32" ? "cmd.exe" : "npx";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", "npx supabase status -o env"]
    : ["supabase", "status", "-o", "env"];
  let output: string;

  try {
    output = execFileSync(command, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error("Local Supabase must be running before E2E tests. Run npm run db:start first.");
  }

  const values = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^(?:export\s+)?([^=]+)=(.*)$/);
    if (!match) continue;

    const [, name, rawValue] = match;
    const value = rawValue.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, "$1$2");
    values.set(name, value);
  }

  const apiUrl = values.get("API_URL");
  const publishableKey = values.get("PUBLISHABLE_KEY");
  const secretKey = values.get("SECRET_KEY");
  if (!apiUrl || !publishableKey || !secretKey) {
    throw new Error("Local Supabase status did not provide the E2E environment values.");
  }

  return {
    NEXT_PUBLIC_SUPABASE_URL: apiUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    SUPABASE_SECRET_KEY: secretKey,
    NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000",
    DEMO_LOGIN_ENABLED: "true",
    DEMO_EMAIL_DOMAIN: "demo.matchrating.app",
  };
}

const localSupabaseEnvironment = getLocalSupabaseEnvironment();

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      ...localSupabaseEnvironment,
    },
  },
  projects: [
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
