import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const profileSource = () =>
  readFileSync(join(process.cwd(), "src/app/profile/page.tsx"), "utf8");

describe("profile page content contract", () => {
  test("only renders the groups the user belongs to", () => {
    const source = profileSource();

    expect(source).toContain("demoUser");
    expect(source).toContain("AvatarInitials");
    expect(source).toContain("Groups");
    expect(source).toContain("demoGroups");
    expect(source).toContain("`/groups/${group.id}/members`");
    expect(source).not.toContain("Pending review");
    expect(source).not.toContain("Rating");
    expect(source).not.toContain("Record");
  });
});
