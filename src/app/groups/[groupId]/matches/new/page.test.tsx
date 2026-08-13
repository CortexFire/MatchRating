import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import NewMatchPage from "./page";

const mocks = vi.hoisted(() => ({
  getMatchRecorderPageData: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/app/actions", () => ({
  createGuestPlayers: vi.fn(),
  retryRatingRebuild: vi.fn(),
  saveActiveMatchDraft: vi.fn(),
  submitMatch: vi.fn(),
}));
vi.mock("@/lib/navigation-read-models", () => ({
  getMatchRecorderPageData: mocks.getMatchRecorderPageData,
}));

const routeGroup = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Wednesday Club",
  description: "",
  memberCount: 4,
};

describe("NewMatchPage", () => {
  const recorderData = {
    group: routeGroup,
    groups: [
      routeGroup,
      { id: "22222222-2222-4222-8222-222222222222", name: "Downtown Rec", description: "", memberCount: 6 },
    ],
    players: [],
    draft: null,
    ratingStatus: { id: null, status: null, canRetry: false },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMatchRecorderPageData.mockResolvedValue(recorderData);
  });

  test("loads switchable groups and keys the recorder to the route group", async () => {
    const page = await NewMatchPage({
      params: Promise.resolve({ groupId: routeGroup.id }),
      searchParams: Promise.resolve({}),
    });
    const recorder = (page.props.children as React.ReactElement[]).at(-1) as React.ReactElement<{
      groupOptions: Array<{ id: string; name: string }>;
      groupId: string;
    }>;

    expect(mocks.getMatchRecorderPageData.mock.calls).toEqual([[routeGroup.id, undefined]]);
    expect(recorder.key).toBe(routeGroup.id);
    expect(recorder.props.groupId).toBe(routeGroup.id);
    expect(recorder.props.groupOptions).toEqual([
      { id: routeGroup.id, name: "Wednesday Club" },
      { id: "22222222-2222-4222-8222-222222222222", name: "Downtown Rec" },
    ]);
  });

  test("shows expired recovery when the requested draft belongs to another group", async () => {
    mocks.getMatchRecorderPageData.mockResolvedValue({ ...recorderData, groups: [routeGroup], draft: null });

    const html = renderToStaticMarkup(await NewMatchPage({
      params: Promise.resolve({ groupId: routeGroup.id }),
      searchParams: Promise.resolve({ draftId: "33333333-3333-4333-8333-333333333333" }),
    }));

    expect(html).toContain("Active match expired");
    expect(html).toContain("This active match expired. Start a new match.");
    expect(html).not.toContain("Match Recording");
  });

  test("surfaces a failed rating rebuild on the recorder route", async () => {
    mocks.getMatchRecorderPageData.mockResolvedValue({
      ...recorderData,
      groups: [routeGroup],
      ratingStatus: { id: "44444444-4444-4444-8444-444444444444", status: "failed", canRetry: false },
    });

    const html = renderToStaticMarkup(await NewMatchPage({
      params: Promise.resolve({ groupId: routeGroup.id }),
      searchParams: Promise.resolve({}),
    }));

    expect(html).toContain("Match saved, but ratings need attention.");
  });

  test("treats a missing or inaccessible route group as not found", async () => {
    mocks.getMatchRecorderPageData.mockResolvedValue(null);

    await expect(NewMatchPage({
      params: Promise.resolve({ groupId: routeGroup.id }),
      searchParams: Promise.resolve({}),
    })).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.notFound).toHaveBeenCalledOnce();
  });
});
