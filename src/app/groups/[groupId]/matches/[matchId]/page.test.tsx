import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import MatchPage from "./page";

vi.mock("@/lib/app-data", () => ({
  getGroupMatchDetail: vi.fn(async () => ({
    id: "match-1", groupId: "group-1", groupName: "Wednesday Club", revisionId: "revision-1", submittedByUserId: "alice",
    status: "confirmed", submittedAt: "2026-08-07T20:00:00.000Z", format: "singles",
    teamA: [{ id: "alice", name: "Alice Tan", initials: "AT" }], teamB: [{ id: "bea", name: "Bea Rivera", initials: "BR" }],
    games: [{ gameNumber: 1, teamAScore: 21, teamBScore: 18, winnerTeam: "A" }], winnerTeam: "A",
    ratingSummary: "2 rating changes", canReview: false, canRevise: true,
  })),
  listPendingReviewsForCurrentUser: vi.fn(async () => []),
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

test("renders the stored active revision in the rich detail view", async () => {
  const html = renderToStaticMarkup(await MatchPage({
    params: Promise.resolve({ groupId: "group-1", matchId: "match-1" }),
  }));

  expect(html).toContain("Match Result Confirmation");
  expect(html).toContain("Alice Tan");
  expect(html).toContain("Bea Rivera");
  expect(html).toContain("Confirmed");
  expect(html).not.toContain("No match details are available yet");
});
