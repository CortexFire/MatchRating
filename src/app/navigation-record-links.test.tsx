import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import GroupsPage from "./groups/page";
import NewGroupPage from "./groups/new/page";
import ReviewMatchesPage from "./matches/review/page";
import MatchResultConfirmationPage from "./matches/[matchId]/confirm/page";
import ProfilePage from "./profile/page";

const appDataMocks = vi.hoisted(() => ({
  getCurrentProfile: vi.fn(async () => ({ id: "alice-id", name: "Alice Tan", initials: "AT" })),
  getGroup: vi.fn(async () => ({
    id: "11111111-1111-4111-8111-111111111111",
    name: "Wednesday Club Ladder",
    description: "Friendly competitive badminton ladder for weekly club nights.",
    memberCount: 8,
  })),
  getMatchGroupId: vi.fn(async () => "11111111-1111-4111-8111-111111111111"),
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

const navigationMocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock("@/app/actions", () => actionMocks);
vi.mock("@/lib/app-data", () => appDataMocks);
vi.mock("next/navigation", () => navigationMocks);

const recordHref = 'href="/groups/11111111-1111-4111-8111-111111111111/matches/new"';

describe("top-level navigation record links", () => {
  test("profile links Record to the current user's primary group", async () => {
    const html = renderToStaticMarkup(await ProfilePage());

    expect(html).toContain(recordHref);
  });

  test("groups links Record to the current user's primary group", async () => {
    const html = renderToStaticMarkup(await GroupsPage());

    expect(html).toContain(recordHref);
  });

  test("new group links Record to the current user's primary group", async () => {
    const html = renderToStaticMarkup(await NewGroupPage());

    expect(html).toContain(recordHref);
  });

  test("matches review links Record to the current user's primary group", async () => {
    const html = renderToStaticMarkup(await ReviewMatchesPage());

    expect(html).toContain(recordHref);
  });

  test("Record falls back to groups when there is no current group", async () => {
    appDataMocks.listCurrentUserGroups.mockResolvedValueOnce([]);

    const html = renderToStaticMarkup(await GroupsPage());

    expect(html).toContain('href="/groups"');
    expect(html).not.toContain("/matches/new");
  });
});

describe("ungrouped match confirmation route", () => {
  test("redirects to the canonical grouped match route", async () => {
    await expect(
      MatchResultConfirmationPage({
        params: Promise.resolve({ matchId: "22222222-2222-4222-8222-222222222222" }),
      }),
    ).rejects.toThrow(
      "NEXT_REDIRECT:/groups/11111111-1111-4111-8111-111111111111/matches/22222222-2222-4222-8222-222222222222",
    );

    expect(appDataMocks.getMatchGroupId).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222");
    expect(appDataMocks.getGroup).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
    expect(navigationMocks.redirect).not.toHaveBeenCalledWith(expect.stringContaining("/groups/demo"));
  });
});
