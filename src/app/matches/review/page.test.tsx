import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { ReviewMatchesContent } from "./page";

vi.mock("@/lib/app-data", () => ({
  listCurrentUserGroups: vi.fn(async () => [{ id: "group-1", name: "Club", description: "", memberCount: 2 }]),
  listPendingReviewsForCurrentUser: vi.fn(async () => [{
    id: "match-1", groupId: "group-1", groupName: "Club", revisionId: "revision-1", submittedByUserId: "alice",
    status: "pending_confirmation", submittedAt: "2026-08-07T20:00:00.000Z", reviewStartedAt: "2026-08-07T20:00:00.000Z", disputeUntil: "2026-09-06T20:00:00.000Z", format: "singles",
    teamA: [{ id: "alice", name: "Alice Tan", initials: "AT" }], teamB: [{ id: "bea", name: "Bea Rivera", initials: "BR" }],
    games: [{ gameNumber: 1, teamAScore: 21, teamBScore: 18, winnerTeam: "A" }], winnerTeam: "A",
    ratingSummary: "2 rating changes", canConfirm: true, canDispute: true, canRevise: false,
  }]),
}));

test("renders pending stored reviews with canonical grouped links", async () => {
  const html = renderToStaticMarkup(await ReviewMatchesContent());

  expect(html).toContain("Alice def. Bea");
  expect(html).toContain("1 - 0");
  expect(html).toContain("Singles");
  expect(html).toContain("Confirmation is optional");
  expect(html).toContain("accepted automatically within 24–48 hours");
  expect(html).toContain('href="/groups/group-1/matches/match-1"');
  expect(html).not.toContain("No pending reviews yet");
});
