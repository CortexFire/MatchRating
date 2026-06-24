import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

const productionFiles = [
  "src/app/page.tsx",
  "src/app/profile/page.tsx",
  "src/app/groups/page.tsx",
  "src/app/groups/[groupId]/page.tsx",
  "src/app/groups/[groupId]/members/page.tsx",
  "src/app/groups/[groupId]/rankings/page.tsx",
  "src/app/groups/new/page.tsx",
  "src/components/app/mobile-shell.tsx",
  "src/components/app/player-row.tsx",
  "src/lib/demo-auth.ts",
  "src/lib/home.ts",
];

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("demo data removal contract", () => {
  test("production user and group UI no longer imports demo-data", () => {
    const offenders = productionFiles.filter((file) => source(file).includes("@/lib/demo-data"));

    expect(offenders.map((file) => relative(process.cwd(), join(process.cwd(), file)))).toEqual([]);
  });

  test("production user and group UI no longer links to the demo slug", () => {
    const offenders = productionFiles.filter((file) => source(file).includes("/groups/demo"));

    expect(offenders.map((file) => relative(process.cwd(), join(process.cwd(), file)))).toEqual([]);
  });

  test("demo login env flags are documented", () => {
    expect(source(".env.example")).toContain("DEMO_LOGIN_ENABLED=false");
    expect(source(".env.example")).toContain("DEMO_EMAIL_DOMAIN=demo.matchrating.app");
  });
});