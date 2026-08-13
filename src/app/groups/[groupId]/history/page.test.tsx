import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import { GroupHistoryContent } from "./page";

const mocks = vi.hoisted(() => ({
  listMatchHistoryPage: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("@/lib/app-data", () => ({
  listMatchHistoryPage: mocks.listMatchHistoryPage,
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listMatchHistoryPage.mockResolvedValue({ matches: [{
    id: "match-1", groupId: "group-1", groupName: "Club", revisionId: "revision-1", submittedByUserId: "alice",
    status: "confirmed", submittedAt: "2026-08-07T20:00:00.000Z", reviewStartedAt: "2026-08-07T20:00:00.000Z", disputeUntil: "2026-09-06T20:00:00.000Z", format: "singles",
    teamA: [{ id: "alice", name: "Alice Tan", initials: "AT" }], teamB: [{ id: "bea", name: "Bea Rivera", initials: "BR" }],
    games: [{ gameNumber: 1, teamAScore: 21, teamBScore: 18, winnerTeam: "A" }], winnerTeam: "A",
    ratingSummary: "2 rating changes", canConfirm: false, canDispute: true, canRevise: false,
  }], nextCursor: "next-page" });
});

test("renders stored group matches with participant headings and no accepted pill", async () => {
  const html = renderToStaticMarkup(await GroupHistoryContent({ params: Promise.resolve({ groupId: "group-1" }) }));

  expect(html).toContain("Alice Tan vs Bea Rivera");
  expect(html).not.toContain(">singles<");
  expect(html).not.toContain(">Accepted<");
  expect(html).toContain('href="/groups/group-1/matches/match-1"');
  expect(html).not.toContain("No matches recorded yet");
  expect(html).toContain("Load older matches");
  expect(mocks.listMatchHistoryPage).toHaveBeenCalledWith({ groupId: "group-1" });
});

test("renders the history title without the redundant rebuild explanation", async () => {
  const html = renderToStaticMarkup(await GroupHistoryContent({ params: Promise.resolve({ groupId: "group-1" }) }));

  expect(html).toContain("Match history");
  expect(html).not.toContain("Historical revisions are the source of truth for every rating rebuild.");
});

test("renders not found instead of an empty history for an inaccessible group", async () => {
  mocks.listMatchHistoryPage.mockRejectedValue({ code: "MR403", message: "Not an active group member" });

  await expect(GroupHistoryContent({ params: Promise.resolve({ groupId: "not-a-group" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  expect(mocks.listMatchHistoryPage).toHaveBeenCalledWith({ groupId: "not-a-group" });
});
