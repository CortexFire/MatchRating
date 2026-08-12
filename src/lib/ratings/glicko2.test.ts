import { describe, expect, it } from "vitest";
import {
  DEFAULT_RATING,
  rebuildGroupRatingsFromMatches,
  updateDoublesGame,
  updateRatingPeriod,
  type RatingState,
} from "./glicko2";

describe("Glicko-2 rating engine", () => {
  it("matches Mark Glickman's published reference example", () => {
    const player: RatingState = {
      rating: 1500,
      rd: 200,
      volatility: 0.06,
      gamesPlayed: 0,
    };

    const updated = updateRatingPeriod(player, [
      { opponent: { ...DEFAULT_RATING, rating: 1400, rd: 30 }, score: 1 },
      { opponent: { ...DEFAULT_RATING, rating: 1550, rd: 100 }, score: 0 },
      { opponent: { ...DEFAULT_RATING, rating: 1700, rd: 300 }, score: 0 },
    ]);

    expect(updated.rating).toBeCloseTo(1464.06, 1);
    expect(updated.rd).toBeCloseTo(151.52, 2);
    expect(updated.volatility).toBeCloseTo(0.05999, 4);
    expect(updated.gamesPlayed).toBe(3);
  });

  it("rewards a doubles win more when the player's partner is weaker", () => {
    const target = { ...DEFAULT_RATING, rating: 1500, rd: 80 };
    const strongPartner = { ...DEFAULT_RATING, rating: 1800, rd: 80 };
    const weakPartner = { ...DEFAULT_RATING, rating: 1200, rd: 80 };
    const opponentA = { ...DEFAULT_RATING, rating: 1500, rd: 80 };
    const opponentB = { ...DEFAULT_RATING, rating: 1500, rd: 80 };

    const withStrongPartner = updateDoublesGame(
      [target, strongPartner],
      [opponentA, opponentB],
      "A",
    ).teamA[0];
    const withWeakPartner = updateDoublesGame(
      [target, weakPartner],
      [opponentA, opponentB],
      "A",
    ).teamA[0];

    expect(withWeakPartner.rating - target.rating).toBeGreaterThan(
      withStrongPartner.rating - target.rating,
    );
  });

  it("uses the selected Team B winner when a historical score favors Team A", () => {
    const rebuilt = rebuildGroupRatingsFromMatches([
      {
        id: "m-score-conflict",
        revisionId: "r-score-conflict",
        submittedAt: "2026-01-01T00:00:00.000Z",
        format: "singles",
        teamAUserIds: ["alice"],
        teamBUserIds: ["bea"],
        games: [{ teamAScore: 21, teamBScore: 18, winnerTeam: "B" }],
      },
    ]);

    expect(rebuilt.ratings.get("alice")?.rating).toBeLessThan(DEFAULT_RATING.rating);
    expect(rebuilt.ratings.get("bea")?.rating).toBeGreaterThan(DEFAULT_RATING.rating);
  });

  it("rebuilds isolated group ratings from active match history", () => {
    const rebuilt = rebuildGroupRatingsFromMatches([
      {
        id: "m1",
        revisionId: "r1",
        submittedAt: "2026-01-01T00:00:00.000Z",
        format: "singles",
        teamAUserIds: ["alice"],
        teamBUserIds: ["bea"],
        games: [{ teamAScore: 21, teamBScore: 18, winnerTeam: "A" }],
      },
      {
        id: "m2",
        revisionId: "r2",
        submittedAt: "2026-01-02T00:00:00.000Z",
        format: "doubles",
        teamAUserIds: ["alice", "cory"],
        teamBUserIds: ["bea", "dev"],
        games: [
          { teamAScore: 19, teamBScore: 21, winnerTeam: "B" },
          { teamAScore: 21, teamBScore: 17, winnerTeam: "A" },
          { teamAScore: 21, teamBScore: 15, winnerTeam: "A" },
        ],
      },
    ]);

    expect(rebuilt.ratings.get("alice")?.gamesPlayed).toBe(4);
    expect(rebuilt.ratings.get("dev")?.gamesPlayed).toBe(3);
    expect(rebuilt.events).toHaveLength(14);
    expect(rebuilt.events[0]).toMatchObject({
      matchId: "m1",
      revisionId: "r1",
      userId: "alice",
      sequence: 1,
    });
  });
});
