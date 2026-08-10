import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import GroupsPage from "./page";

const appDataMocks = vi.hoisted(() => ({
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

describe("GroupsPage", () => {
  test("shows a create-group header action alongside existing groups", async () => {
    const html = renderToStaticMarkup(await GroupsPage());

    expect(html).toContain('href="/groups/new"');
    expect(html).toContain("Create group");
    expect(html).toContain('href="/groups/11111111-1111-4111-8111-111111111111"');
  });

  test("shows a create-group action when the user has no groups", async () => {
    appDataMocks.listCurrentUserGroups.mockResolvedValueOnce([]);

    const html = renderToStaticMarkup(await GroupsPage());

    expect(html).toContain("Create or join a group to start ranking matches.");
    expect(html).toContain('href="/groups/new"');
    expect(html).toContain("Create group");
  });
});
