import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import HistoryPage from "./page";

const mocks = vi.hoisted(() => ({
  canCurrentUserReadGroup: vi.fn(),
  listGroupMatches: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("@/lib/app-data", () => ({
  canCurrentUserReadGroup: mocks.canCurrentUserReadGroup,
  listGroupMatches: mocks.listGroupMatches,
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.canCurrentUserReadGroup.mockResolvedValue(true);
  mocks.listGroupMatches.mockResolvedValue([{
    id: "match-1", groupId: "group-1", groupName: "Club", revisionId: "revision-1", submittedByUserId: "alice",
    status: "confirmed", submittedAt: "2026-08-07T20:00:00.000Z", format: "singles",
    teamA: [{ id: "alice", name: "Alice Tan", initials: "AT" }], teamB: [{ id: "bea", name: "Bea Rivera", initials: "BR" }],
    games: [{ gameNumber: 1, teamAScore: 21, teamBScore: 18, winnerTeam: "A" }], winnerTeam: "A",
    ratingSummary: "2 rating changes", canReview: false, canRevise: true,
  }]);
});

test("renders stored group matches", async () => {
  const html = renderToStaticMarkup(await HistoryPage({ params: Promise.resolve({ groupId: "group-1" }) }));

  expect(html).toContain("Alice Tan vs Bea Rivera");
  expect(html).toContain('href="/groups/group-1/matches/match-1"');
  expect(html).not.toContain("No matches recorded yet");
});

test("renders not found instead of an empty history for an inaccessible group", async () => {
  mocks.canCurrentUserReadGroup.mockResolvedValue(false);

  await expect(HistoryPage({ params: Promise.resolve({ groupId: "not-a-group" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  expect(mocks.listGroupMatches).not.toHaveBeenCalled();
});
