import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import * as appData from "@/lib/app-data";
import NewMatchPage from "./page";

const appDataMocks = vi.hoisted(() => ({
  getActiveMatchDraft: vi.fn(),
  getGroup: vi.fn(),
  listCurrentUserGroups: vi.fn(),
  listGroupPlayers: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/actions", () => ({
  createGuestPlayers: vi.fn(),
  saveActiveMatchDraft: vi.fn(),
  submitMatch: vi.fn(),
}));
vi.mock("@/lib/app-data", () => appDataMocks);

const routeGroup = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Wednesday Club",
  description: "",
  memberCount: 4,
};

describe("NewMatchPage", () => {
  test("loads switchable groups and keys the recorder to the route group", async () => {
    appDataMocks.getGroup.mockResolvedValue(routeGroup);
    appDataMocks.listCurrentUserGroups.mockResolvedValue([
      routeGroup,
      { id: "22222222-2222-4222-8222-222222222222", name: "Downtown Rec", description: "", memberCount: 6 },
    ]);
    appDataMocks.listGroupPlayers.mockResolvedValue([]);
    appDataMocks.getActiveMatchDraft.mockResolvedValue(null);

    const page = await NewMatchPage({
      params: Promise.resolve({ groupId: routeGroup.id }),
      searchParams: Promise.resolve({}),
    });
    const recorder = page.props.children as React.ReactElement<{
      groupOptions: Array<{ id: string; name: string }>;
      groupId: string;
    }>;

    expect(vi.mocked(appData.listCurrentUserGroups)).toHaveBeenCalledOnce();
    expect(recorder.key).toBe(routeGroup.id);
    expect(recorder.props.groupId).toBe(routeGroup.id);
    expect(recorder.props.groupOptions).toEqual([
      { id: routeGroup.id, name: "Wednesday Club" },
      { id: "22222222-2222-4222-8222-222222222222", name: "Downtown Rec" },
    ]);
  });

  test("shows expired recovery when the requested draft belongs to another group", async () => {
    appDataMocks.getGroup.mockResolvedValue(routeGroup);
    appDataMocks.listCurrentUserGroups.mockResolvedValue([routeGroup]);
    appDataMocks.listGroupPlayers.mockResolvedValue([]);
    appDataMocks.getActiveMatchDraft.mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
      groupId: "22222222-2222-4222-8222-222222222222",
      groupName: "Downtown Rec",
      role: "Creator",
      canEdit: true,
      format: "singles",
      teamA: [],
      teamB: [],
      scores: [],
      initialMatch: { format: "singles", teamAUserIds: [], teamBUserIds: [], games: [] },
    });

    const html = renderToStaticMarkup(await NewMatchPage({
      params: Promise.resolve({ groupId: routeGroup.id }),
      searchParams: Promise.resolve({ draftId: "33333333-3333-4333-8333-333333333333" }),
    }));

    expect(html).toContain("Active match expired");
    expect(html).toContain("This active match expired. Start a new match.");
    expect(html).not.toContain("Match Recording");
  });
});
