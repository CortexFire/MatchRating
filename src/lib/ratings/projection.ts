import type { RatingEvent, RatingState } from "./glicko2";

export type RatingProjection = {
  ratings: Array<RatingState & { userId: string; rank: number }>;
  events: RatingEvent[];
};

export function toRatingProjection(ratings: Map<string, RatingState>, events: RatingEvent[]): RatingProjection {
  const ranked = [...ratings.entries()]
    .map(([userId, rating]) => ({ userId, ...rating }))
    .sort((left, right) => right.rating - left.rating || left.userId.localeCompare(right.userId));

  return {
    ratings: ranked.map((rating, index) => ({ ...rating, rank: index + 1 })),
    events,
  };
}
