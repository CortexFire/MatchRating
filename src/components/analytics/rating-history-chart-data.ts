import { type AnalyticsRatingPoint } from "@/lib/analytics/analytics-policy";
import { formatRating } from "@/lib/ratings/rating-display";

type RatingHistoryPoint = AnalyticsRatingPoint;
type RatingTooltipPoint = Pick<RatingHistoryPoint, "rating" | "rd" | "performanceSd">;

export type RatingHistoryChartPoint = RatingHistoryPoint & {
  performanceRange: [number, number];
  latestRating: number | null;
};

export function buildRatingHistoryChartData(points: RatingHistoryPoint[], yDomain: [number, number]): {
  points: RatingHistoryChartPoint[];
  yDomain: [number, number];
} {
  const chartPoints = points.map((point, index) => ({
    ...point,
    performanceRange: [
      point.rating - point.performanceSd,
      point.rating + point.performanceSd,
    ] as [number, number],
    latestRating: index === points.length - 1 ? point.rating : null,
  }));
  return {
    points: chartPoints,
    yDomain,
  };
}

export function formatRatingPointDetails(point: RatingTooltipPoint) {
  const lower = point.rating - point.performanceSd;
  const upper = point.rating + point.performanceSd;

  return `${formatRating(point.rating, point.rd)}, performance range ${lower}–${upper} (±${point.performanceSd})`;
}

export function formatRatingTooltipEntry(point: RatingTooltipPoint): [string, "Rating"] {
  return [formatRatingPointDetails(point), "Rating"];
}
