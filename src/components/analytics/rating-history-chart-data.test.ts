import { describe, expect, test } from "vitest";
import { buildRatingHistoryChartData, formatRatingTooltipEntry } from "./rating-history-chart-data";

describe("rating history chart data", () => {
  test("builds historical range tuples and a padded domain from consistency", () => {
    const result = buildRatingHistoryChartData([
      {
        matchId: "m1",
        occurredAt: "2026-07-20T12:00:00.000Z",
        rating: 1566,
        rd: 110,
        performanceSd: 200,
        ratingDelta: 8,
      },
      {
        matchId: "m2",
        occurredAt: "2026-08-01T12:00:00.000Z",
        rating: 1578,
        rd: 110.01,
        performanceSd: 85,
        ratingDelta: 12,
      },
    ]);

    expect(result).toEqual({
      points: [
        expect.objectContaining({ matchId: "m1", performanceRange: [1366, 1766], latestRating: null }),
        expect.objectContaining({ matchId: "m2", performanceRange: [1493, 1663], latestRating: 1578 }),
      ],
      yDomain: [1346, 1786],
    });
  });

  test("formats the visible tooltip with one rating label and a concise performance range", () => {
    expect(formatRatingTooltipEntry({ rating: 1578, rd: 110.01, performanceSd: 85 })).toEqual([
      "1578?, performance range 1493–1663 (±85)",
      "Rating",
    ]);
  });
});
