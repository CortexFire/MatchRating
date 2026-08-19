import { describe, expect, test } from "vitest";
import { toMatchResultSummary } from "./match-result-summary";
import type { MatchView } from "./read-model";

const match = {
  id: "match-1",
  groupId: "group-1",
  groupName: "Club",
  revisionId: "revision-1",
  submittedByUserId: "alice",
  status: "confirmed",
  submittedAt: "2026-08-07T20:00:00.000Z",
  correctionStartedAt: "2026-08-07T20:00:00.000Z",
  correctionUntil: "2026-09-06T20:00:00.000Z",
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
  canCorrect: false,
  canRevise: true,
} satisfies MatchView;

describe("toMatchResultSummary", () => {
  test("creates the canonical linked winner result summary for any match status", () => {
    expect(toMatchResultSummary(match)).toEqual({
      id: "match-1",
      groupId: "group-1",
      summary: "Bea def. Alice",
      details: "Aug 7, 2026, 1:00 PM @ Club",
      submittedAt: "Aug 7, 2026, 1:00 PM",
      groupName: "Club",
      score: "2 - 1",
      format: "Doubles",
    });
  });

  test("provides the actual one-set score in winner-first order when team A wins", () => {
    expect(
      toMatchResultSummary({
        ...match,
        games: [
          {
            gameNumber: 1,
            teamAScore: 21,
            teamBScore: 18,
            winnerTeam: "A",
          },
        ],
        winnerTeam: "A",
      }),
    ).toMatchObject({
      summary: "Alice def. Bea",
      score: "1 - 0",
      singleGameScore: "21 - 18",
    });
  });

  test("provides the actual one-set score in winner-first order when team B wins", () => {
    expect(
      toMatchResultSummary({
        ...match,
        games: [
          {
            gameNumber: 1,
            teamAScore: 18,
            teamBScore: 21,
            winnerTeam: "B",
          },
        ],
        winnerTeam: "B",
      }),
    ).toMatchObject({
      summary: "Bea def. Alice",
      score: "1 - 0",
      singleGameScore: "21 - 18",
    });
  });

  test("does not provide a single-game score for multi-set results", () => {
    expect(toMatchResultSummary(match)).not.toHaveProperty("singleGameScore");
  });

  test("uses an em dash when a result has no games", () => {
    expect(toMatchResultSummary({ ...match, games: [] })).toMatchObject({
      score: "—",
    });
    expect(toMatchResultSummary({ ...match, games: [] })).not.toHaveProperty(
      "singleGameScore",
    );
  });
});
