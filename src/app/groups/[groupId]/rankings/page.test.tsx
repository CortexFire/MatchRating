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
    { id: "alice", name: "Alice Tan", initials: "AT", role: "Owner", rating: 1640, rd: 72, performanceSd: 85, rank: 1, gamesPlayed: 18, status: "Active" },
    { id: "bea", name: "Bea Rivera", initials: "BR", role: "Member", rating: 1580, rd: 81, performanceSd: 91, rank: 2, gamesPlayed: 14, status: "Active" },
    { id: "cory", name: "Cory Shah", initials: "CS", role: "Member", rating: 1500, rd: 350, performanceSd: 200, rank: 0, gamesPlayed: 0, status: "Inactive" },
  ]);

  const html = renderToStaticMarkup(await RankingsContent({ params: Promise.resolve({ groupId: "group-1" }) }));

  expect(html).toContain('href="/groups/group-1/players/alice/analytics"');
  expect(html).toContain('aria-label="View analytics for Alice Tan"');
  expect(html).toContain('href="/groups/group-1/players/bea/analytics"');
  expect(html).toContain("± 85");
  expect(html).not.toContain("Cory Shah");
  expect(html).not.toContain('href="/groups/group-1/players/cory/analytics"');
});

test("shows no rankings when every member is unranked", async () => {
  mocks.listGroupPlayers.mockResolvedValue([
    { id: "cory", name: "Cory Shah", initials: "CS", role: "Member", rating: 1500, rd: 350, performanceSd: 200, rank: 0, gamesPlayed: 0, status: "Inactive" },
  ]);

  const html = renderToStaticMarkup(await RankingsContent({ params: Promise.resolve({ groupId: "group-1" }) }));

  expect(html).toContain("No rankings yet.");
  expect(html).not.toContain("Cory Shah");
});
