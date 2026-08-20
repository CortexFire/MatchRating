import {
  createDefaultConsistencyState,
  type ConsistencyEvent,
  type ConsistencyState,
} from "./consistency";
import type { RatingEvent, RatingState } from "./glicko2";

export type RatingProjection = {
  ratings: Array<RatingState & {
    userId: string;
    rank: number;
    logKappaMean: number;
    logKappaVariance: number;
    consistencyMatchesPlayed: number;
  }>;
  events: RatingEvent[];
  consistencyEvents: ConsistencyEvent[];
};

export function toRatingProjection(
  ratings: Map<string, RatingState>,
  events: RatingEvent[],
  consistencyStates: Map<string, ConsistencyState> = new Map(),
  consistencyEvents: ConsistencyEvent[] = [],
): RatingProjection {
  const ranked = [...ratings.entries()]
    .map(([userId, rating]) => {
      const {
        logKappaMean,
        logKappaVariance,
        matchesPlayed: consistencyMatchesPlayed,
      } = consistencyStates.get(userId) ?? createDefaultConsistencyState();
      return {
        userId,
        ...rating,
        logKappaMean,
        logKappaVariance,
        consistencyMatchesPlayed,
      };
    })
    .sort((left, right) => right.rating - left.rating || left.userId.localeCompare(right.userId));

  return {
    ratings: ranked.map((rating, index) => ({ ...rating, rank: index + 1 })),
    events,
    consistencyEvents,
  };
}
