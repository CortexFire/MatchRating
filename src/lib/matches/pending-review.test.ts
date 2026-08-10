import { describe, expect, test } from "vitest";
import { toPendingReviewMatch } from "./pending-review";
import type { MatchView } from "./read-model";

const baseMatch = {
  id: "match-1",
  groupId: "group-1",
  groupName: "Club",
  revisionId: "revision-1",
  submittedByUserId: "alice",
  status: "pending_confirmation",
  submittedAt: "2026-08-07T20:00:00.000Z",
  format: "doubles",
  teamA: [{ id: "alice", name: "Alice Tan", initials: "AT" }],
  teamB: [{ id: "bea", name: "Bea Rivera", initials: "BR" }],
  games: [
    { gameNumber: 1, teamAScore: 18, teamBScore: 21, winnerTeam: "B" },
    { gameNumber: 2, teamAScore: 21, teamBScore: 17, winnerTeam: "A" },
    { gameNumber: 3, teamAScore: 16, teamBScore: 21, winnerTeam: "B" },
  ],
  winnerTeam: "B",
  ratingSummary: "2 rating changes",
  canReview: true,
  canRevise: true,
} satisfies MatchView;

describe("toPendingReviewMatch", () => {
  test("preserves the group route and formats the winning match summary", () => {
    expect(toPendingReviewMatch(baseMatch)).toEqual({
      id: "match-1",
      groupId: "group-1",
      summary: "Bea def. Alice",
      details: "Aug 7, 2026, 1:00 PM @ Club",
      score: "2 - 1",
      format: "Doubles",
    });
  });

  test("uses an em dash when a pending match has no games", () => {
    expect(
      toPendingReviewMatch({
        ...baseMatch,
        format: "singles",
        games: [],
      }),
    ).toMatchObject({
      score: "—",
      format: "Singles",
    });
  });
});
