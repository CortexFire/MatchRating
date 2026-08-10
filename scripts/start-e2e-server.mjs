import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(scriptPath), "..");
const require = createRequire(import.meta.url);

export const ALLOW_EXTERNAL_SUPABASE_ENV = "MATCHRATING_E2E_ALLOW_EXTERNAL_SUPABASE";

export function parseSupabaseStatusEnvironment(output) {
  const values = new Map();

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^(?:export\s+)?([^=]+)=(.*)$/);
    if (!match) continue;

    const [, name, rawValue] = match;
    values.set(name, unquote(rawValue));
  }

  return values;
}

export function getE2EServerEnvironment(environment, readLocalStatus) {
  const supplied = requiredSupabaseEnvironment(environment);
  if (environment[ALLOW_EXTERNAL_SUPABASE_ENV] === "true") {
    if (!supplied) {
      throw new Error(
        `${ALLOW_EXTERNAL_SUPABASE_ENV}=true requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SECRET_KEY.`,
      );
    }

    return {
      ...environment,
      ...supplied,
      NEXT_PUBLIC_SITE_URL: environment.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000",
      DEMO_LOGIN_ENABLED: "true",
      DEMO_EMAIL_DOMAIN: "demo.matchrating.app",
    };
  }

  const localStatus = parseSupabaseStatusEnvironment(readLocalStatus());
  const local = requiredSupabaseEnvironment({
    NEXT_PUBLIC_SUPABASE_URL: localStatus.get("API_URL"),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: localStatus.get("PUBLISHABLE_KEY"),
    SUPABASE_SECRET_KEY: localStatus.get("SECRET_KEY"),
  });

  if (!local) {
    throw new Error("Local Supabase status did not provide the E2E environment values.");
  }

  return {
    ...environment,
    ...local,
    NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000",
    DEMO_LOGIN_ENABLED: "true",
    DEMO_EMAIL_DOMAIN: "demo.matchrating.app",
  };
}

export function resolveProjectBinary(packageName) {
  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const binary = typeof packageJson.bin === "string" ? packageJson.bin : packageJson.bin?.[packageName];

  if (typeof binary !== "string") {
    throw new Error(`Could not resolve the ${packageName} executable.`);
  }

  return resolve(dirname(packageJsonPath), binary);
}

function unquote(value) {
  if (value.length < 2) return value;

  const first = value.at(0);
  const last = value.at(-1);
  return (first === '"' && last === '"') || (first === "'" && last === "'")
    ? value.slice(1, -1)
    : value;
}

function requiredSupabaseEnvironment(environment) {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = environment.SUPABASE_SECRET_KEY;

  return url && publishableKey && secretKey
    ? {
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
      SUPABASE_SECRET_KEY: secretKey,
    }
    : undefined;
}

function readLocalSupabaseStatus() {
  try {
    return execFileSync(process.execPath, [resolveProjectBinary("supabase"), "status", "-o", "env"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, SUPABASE_DISABLE_TELEMETRY: "true" },
    });
  } catch {
    throw new Error("Local Supabase must be running before E2E tests. Run npm run db:start first.");
  }
}

function startServer() {
  const environment = getE2EServerEnvironment(process.env, readLocalSupabaseStatus);
  const child = spawn(process.execPath, [resolveProjectBinary("next"), "dev"], {
    cwd: projectRoot,
    env: environment,
    stdio: "inherit",
    windowsHide: true,
  });

  child.on("exit", (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill(signal));
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  startServer();
}
