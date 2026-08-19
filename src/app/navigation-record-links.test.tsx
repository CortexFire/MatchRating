import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { GroupsContent } from "./groups/page";
import { NewGroupContent } from "./groups/new/page";
import { ProfileContent } from "./profile/page";

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

const actionMocks = vi.hoisted(() => ({
  createGroup: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/app/actions", () => actionMocks);
vi.mock("@/lib/app-data", () => appDataMocks);
vi.mock("@/lib/personalized-cache", () => ({
  getPrivateCurrentProfile: vi.fn(async () => ({ id: "alice-id", name: "Alice Tan", initials: "AT" })),
}));

const recordHref = 'href="/groups/11111111-1111-4111-8111-111111111111/matches/new"';

describe("top-level navigation record links", () => {
  test("profile links Record to the current user's primary group", async () => {
    const html = renderToStaticMarkup(await ProfileContent());

    expect(html).toContain(recordHref);
  });

  test("groups links Record to the current user's primary group", async () => {
    const html = renderToStaticMarkup(await GroupsContent());

    expect(html).toContain(recordHref);
  });

  test("new group links Record to the current user's primary group", async () => {
    const html = renderToStaticMarkup(await NewGroupContent());

    expect(html).toContain(recordHref);
  });

  test("new group does not show the removed group-isolation subtitle", async () => {
    const html = renderToStaticMarkup(await NewGroupContent());

    expect(html).not.toContain("Ratings, history, and rankings stay independent per group.");
  });

  test("Record falls back to groups when there is no current group", async () => {
    appDataMocks.listCurrentUserGroups.mockResolvedValueOnce([]);

    const html = renderToStaticMarkup(await GroupsContent());

    expect(html).toContain('href="/groups"');
    expect(html).not.toContain("/matches/new");
  });
});
