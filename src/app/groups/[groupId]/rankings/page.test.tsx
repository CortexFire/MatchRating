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

test("links every ranked player row to that player's analytics", async () => {
  mocks.listGroupPlayers.mockResolvedValue([
    { id: "alice", name: "Alice Tan", initials: "AT", role: "Owner", rating: 1640, rd: 72, rank: 1, gamesPlayed: 18, status: "Active" },
    { id: "bea", name: "Bea Rivera", initials: "BR", role: "Member", rating: 1580, rd: 81, rank: 2, gamesPlayed: 14, status: "Active" },
  ]);

  const html = renderToStaticMarkup(await RankingsContent({ params: Promise.resolve({ groupId: "group-1" }) }));

  expect(html).toContain('href="/groups/group-1/players/alice/analytics"');
  expect(html).toContain('aria-label="View analytics for Alice Tan"');
  expect(html).toContain('href="/groups/group-1/players/bea/analytics"');
});
