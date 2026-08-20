import { type AnalyticsPeriodSnapshot } from "@/lib/analytics/analytics-policy";

const Y_DOMAIN_PADDING = 20;

type RatingHistoryPoint = AnalyticsPeriodSnapshot["ratingHistory"][number];

export type RatingHistoryChartPoint = RatingHistoryPoint & {
  performanceRange: [number, number];
  latestRating: number | null;
};

export function buildRatingHistoryChartData(points: RatingHistoryPoint[]): {
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
  const lowerBound = Math.min(...chartPoints.map((point) => point.performanceRange[0]));
  const upperBound = Math.max(...chartPoints.map((point) => point.performanceRange[1]));

  return {
    points: chartPoints,
    yDomain: [lowerBound - Y_DOMAIN_PADDING, upperBound + Y_DOMAIN_PADDING],
  };
}
