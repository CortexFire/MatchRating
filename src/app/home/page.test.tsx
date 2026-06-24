import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import HomePage from "./page";

vi.mock("@/lib/app-data", () => ({
  getCurrentProfile: vi.fn(async () => ({ id: "alice-id", name: "Alice Tan", initials: "AT" })),
  listCurrentUserGroups: vi.fn(async () => [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Wednesday Club Ladder",
      description: "Friendly competitive badminton ladder for weekly club nights.",
      memberCount: 8,
    },
  ]),
}));

describe("HomePage", () => {
  test("links to the current user's real group", async () => {
    const html = renderToStaticMarkup(await HomePage());

    expect(html).toContain("Alice Tan");
    expect(html).toContain('href="/groups/11111111-1111-4111-8111-111111111111"');
    expect(html).toContain('href="/groups/11111111-1111-4111-8111-111111111111/matches/new"');
  });
});
