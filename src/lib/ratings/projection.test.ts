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
    );

    expect(projection.ratings).toEqual([
      { userId: "player-a", rating: 1600, rd: 120, volatility: 0.05, gamesPlayed: 3, rank: 1 },
      { userId: "player-b", rating: 1499, rd: 100, volatility: 0.06, gamesPlayed: 1, rank: 2 },
    ]);
  });
});
