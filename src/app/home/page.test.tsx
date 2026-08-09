import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import HomePage from "./page";

const appDataMocks = vi.hoisted(() => ({
  getCurrentProfile: vi.fn(async () => ({ id: "alice-id", name: "Alice Tan", initials: "AT" })),
  listCurrentUserActiveMatchDrafts: vi.fn(async () => [
    {
      id: "22222222-2222-4222-8222-222222222222",
      groupId: "11111111-1111-4111-8111-111111111111",
      groupName: "Wednesday Club Ladder",
      format: "singles",
      teamA: ["Alice Tan"],
      teamB: ["Bea Chen"],
      scores: ["12-12"],
      role: "Creator",
    },
  ]),
  listCurrentUserGroups: vi.fn(async () => [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Wednesday Club Ladder",
      description: "Friendly competitive badminton ladder for weekly club nights.",
      memberCount: 8,
    },
  ]),
}));

vi.mock("@/lib/app-data", () => appDataMocks);

describe("HomePage", () => {
  test("links to the current user's real group", async () => {
    const html = renderToStaticMarkup(await HomePage());

    expect(html).toContain("Alice Tan");
    expect(html).toContain('href="/groups/11111111-1111-4111-8111-111111111111"');
    expect(html).toContain('href="/groups/11111111-1111-4111-8111-111111111111/matches/new"');
    expect(html).toContain("Active matches");
    expect(html).toContain('href="/groups/11111111-1111-4111-8111-111111111111/matches/new?draftId=22222222-2222-4222-8222-222222222222"');
    expect(html).not.toContain('href="/groups/new"');
  });

  test("offers group creation when the user has no groups", async () => {
    appDataMocks.listCurrentUserGroups.mockResolvedValueOnce([]);

    const html = renderToStaticMarkup(await HomePage());

    expect(html).toContain("Create or join a group to start recording matches.");
    expect(html).toContain('href="/groups/new"');
    expect(html).toContain("Create group");
  });
});
