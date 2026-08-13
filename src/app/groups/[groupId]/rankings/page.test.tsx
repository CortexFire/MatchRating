import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import { RankingsContent } from "./page";

const mocks = vi.hoisted(() => ({
  getGroupRatingRebuildStatus: vi.fn(),
  listGroupPlayers: vi.fn(),
}));

vi.mock("@/lib/app-data", () => ({
  getGroupRatingRebuildStatus: mocks.getGroupRatingRebuildStatus,
  listGroupPlayers: mocks.listGroupPlayers,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getGroupRatingRebuildStatus.mockResolvedValue({ id: null, status: null, canRetry: false });
  mocks.listGroupPlayers.mockResolvedValue([]);
});

test("renders rankings without the redundant group-isolation explanation", async () => {
  const html = renderToStaticMarkup(await RankingsContent({ params: Promise.resolve({ groupId: "group-1" }) }));

  expect(html).toContain("Rankings");
  expect(html).not.toContain("Glicko-2 ratings are isolated to this group.");
});
