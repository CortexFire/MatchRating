import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const profileSource = () =>
  readFileSync(join(process.cwd(), "src/app/profile/page.tsx"), "utf8");

describe("profile page content contract", () => {
  test("only renders the groups the user belongs to", () => {
    const source = profileSource();

    expect(source).toContain("getCurrentProfile");
    expect(source).toContain("AvatarInitials");
    expect(source).toContain("Groups");
    expect(source).toContain("listCurrentUserGroups");
    expect(source).toContain("`/groups/${group.id}/members`");
    expect(source).toContain("signOut");
    expect(source).toContain('variant="secondary"');
    expect(source).toContain("Log out");
    expect(source).not.toContain("@/lib/demo-data");
    expect(source).not.toContain("Pending review");
    expect(source).not.toContain("Rating");
    expect(source).not.toContain("Record");
  });
});