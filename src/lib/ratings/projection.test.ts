import { describe, expect, test } from "vitest";
import { toRatingProjection } from "./projection";

describe("toRatingProjection", () => {
  test("serializes rebuilt ratings with deterministic leaderboard ranks", () => {
    const projection = toRatingProjection(
      new Map([
        ["player-b", { rating: 1499, rd: 100, volatility: 0.06, gamesPlayed: 1 }],
        ["player-a", { rating: 1600, rd: 120, volatility: 0.05, gamesPlayed: 3 }],
      ]),
      [],
      new Map([
        ["player-a", { logKappaMean: Math.log(150), logKappaVariance: 0.08, matchesPlayed: 4 }],
      ]),
      [],
    );

    expect(projection.ratings).toEqual([
      {
        userId: "player-a",
        rating: 1600,
        rd: 120,
        volatility: 0.05,
        gamesPlayed: 3,
        logKappaMean: Math.log(150),
        logKappaVariance: 0.08,
        consistencyMatchesPlayed: 4,
        rank: 1,
      },
      {
        userId: "player-b",
        rating: 1499,
        rd: 100,
        volatility: 0.06,
        gamesPlayed: 1,
        logKappaMean: 5.298317366548,
        logKappaVariance: 0.1225,
        consistencyMatchesPlayed: 0,
        rank: 2,
      },
    ]);
    expect(projection.ratings[1]).not.toHaveProperty("matchesPlayed", 0);
    expect(projection.consistencyEvents).toEqual([]);
  });
});
