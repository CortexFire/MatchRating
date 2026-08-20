import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import { AnalyticsPageContent } from "./page";

const mocks = vi.hoisted(() => ({
  getPlayerAnalyticsData: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("@/lib/analytics/analytics-read-model", () => ({
  getPlayerAnalyticsData: mocks.getPlayerAnalyticsData,
}));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  useRouter: () => ({ push: vi.fn() }),
}));

const groupId = "11111111-1111-4111-8111-111111111111";
const playerId = "22222222-2222-4222-8222-222222222222";
const emptySnapshot = {
  summary: { rank: 2, rankedPlayerCount: 8, currentRating: 1542, ratingChange: 0, wins: 0, losses: 0, winRate: null },
  ratingHistory: [],
  flags: [],
  matchups: [],
};
const model = {
  status: "ready" as const,
  asOf: "2026-08-19T12:00:00.000Z",
  viewerUserId: "viewer-id",
  subject: { id: playerId, name: "Charlie Duong" },
  group: { id: groupId, name: "Downtown Rec" },
  availableGroups: [{ id: groupId, name: "Downtown Rec" }],
  periods: { all: emptySnapshot, "30d": emptySnapshot, "90d": emptySnapshot, "1y": emptySnapshot },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPlayerAnalyticsData.mockResolvedValue(model);
});

test("loads and renders one authorized player analytics model", async () => {
  const html = renderToStaticMarkup(await AnalyticsPageContent({
    params: Promise.resolve({ groupId, playerId }),
  }));

  expect(mocks.getPlayerAnalyticsData).toHaveBeenCalledWith(groupId, playerId);
  expect(html).toContain("Analytics");
  expect(html).toContain("Charlie Duong");
});

test("treats an inaccessible player-group combination as not found", async () => {
  mocks.getPlayerAnalyticsData.mockResolvedValue(null);

  await expect(AnalyticsPageContent({
    params: Promise.resolve({ groupId, playerId }),
  })).rejects.toThrow("NEXT_NOT_FOUND");

  expect(mocks.notFound).toHaveBeenCalledOnce();
});
