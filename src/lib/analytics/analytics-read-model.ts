import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  projectAggregatedPlayerAnalytics,
  type AggregatedAnalyticsFactsPayload,
  type AggregatedAnalyticsPeriodFacts,
  type AnalyticsPeriod,
  type AnalyticsRatingPoint,
  type PlayerAnalyticsViewModel,
} from "./analytics-policy";

const PERIODS: AnalyticsPeriod[] = ["all", "30d", "90d", "1y"];

export async function getPlayerAnalyticsData(
  groupId: string,
  playerId: string,
): Promise<PlayerAnalyticsViewModel | null> {
  if (!isUuid(groupId) || !isUuid(playerId)) return null;

  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("get_player_analytics_v2", {
    p_group_id: groupId,
    p_user_id: playerId,
  });
  if (error) throw error;
  if (data === null) return null;
  if (!isAggregatedAnalyticsFactsPayload(data)) {
    throw new Error("get_player_analytics_v2 returned an invalid payload");
  }
  return projectAggregatedPlayerAnalytics(data);
}

export function isAggregatedAnalyticsFactsPayload(
  value: unknown,
): value is AggregatedAnalyticsFactsPayload {
  if (!isRecord(value) || (value.status !== "ready" && value.status !== "updating")) return false;
  if (
    !validTimestamp(value.asOf)
    || typeof value.viewerUserId !== "string"
    || !isPerson(value.subject)
    || !isGroup(value.group)
    || !Array.isArray(value.availableGroups)
    || !value.availableGroups.every(isGroup)
  ) return false;
  if (value.status === "updating") return true;

  const periods = value.periods;
  return validRatingVersion(value.ratingVersion)
    && isCurrent(value.current)
    && nonNegativeInteger(value.currentWinStreak)
    && isRecord(periods)
    && PERIODS.every((period) => isAggregatedPeriodFacts(periods[period]));
}

function isAggregatedPeriodFacts(value: unknown): value is AggregatedAnalyticsPeriodFacts {
  if (!isRecord(value)) return false;
  if (
    !nonNegativeInteger(value.matchCount)
    || !nonNegativeInteger(value.wins)
    || value.wins > value.matchCount
    || !nonNegativeInteger(value.gameCount)
    || !nonNegativeInteger(value.gameWins)
    || value.gameWins > value.gameCount
    || !finiteNumber(value.expectedGameWins)
    || !finiteNumber(value.ratingDelta)
    || !nonNegativeInteger(value.upsetWins)
    || value.upsetWins > value.wins
    || !nonNegativeInteger(value.residualCount)
    || value.residualCount !== value.matchCount
    || !finiteNumber(value.residualSum)
    || !finiteNumber(value.residualSumSquares)
    || value.residualSumSquares < 0
    || !nonNegativeInteger(value.activePeerCount)
    || !nonNegativeInteger(value.encounteredActiveCount)
    || value.encounteredActiveCount > value.activePeerCount
    || !Array.isArray(value.cohort)
    || !value.cohort.every(isCohortAggregate)
    || !uniqueStrings(value.cohort.map((item) => item.userId))
    || !Array.isArray(value.relationships)
    || !value.relationships.every(isRelationshipAggregate)
    || !Array.isArray(value.ratingHistory)
    || value.ratingHistory.length > 200
    || !value.ratingHistory.every(isAnalyticsRatingPoint)
    || !isChronological(value.ratingHistory)
    || !uniqueStrings(value.ratingHistory.map((point) => point.matchId))
    || !isBounds(value.ratingHistoryBounds)
  ) return false;
  return value.ratingHistory.length > 0
    || (value.ratingHistoryBounds[0] === 0 && value.ratingHistoryBounds[1] === 1);
}

function isCohortAggregate(value: unknown) {
  return isRecord(value)
    && typeof value.userId === "string"
    && nonNegativeInteger(value.matchCount)
    && finiteNumber(value.ratingDelta)
    && nonNegativeInteger(value.doublesMatchCount)
    && value.doublesMatchCount <= value.matchCount
    && nonNegativeInteger(value.distinctPartnerCount);
}

function isRelationshipAggregate(value: unknown) {
  return isRecord(value)
    && isPerson(value.player)
    && (value.kind === "partner" || value.kind === "opponent")
    && nonNegativeInteger(value.matches)
    && nonNegativeInteger(value.wins)
    && value.wins <= value.matches
    && nonNegativeInteger(value.gameCount)
    && nonNegativeInteger(value.gameWins)
    && value.gameWins <= value.gameCount
    && finiteNumber(value.expectedGameWins);
}

export function isAnalyticsRatingPoint(value: unknown): value is AnalyticsRatingPoint {
  return isRecord(value)
    && typeof value.matchId === "string"
    && validTimestamp(value.occurredAt)
    && finiteNumber(value.rating)
    && finiteNumber(value.rd)
    && value.rd > 0
    && positiveInteger(value.performanceSd)
    && finiteNumber(value.ratingDelta);
}

function isChronological(points: AnalyticsRatingPoint[]) {
  return points.every((point, index) => {
    if (!index) return true;
    const previous = points[index - 1];
    return Date.parse(previous.occurredAt) < Date.parse(point.occurredAt)
      || (
        previous.occurredAt === point.occurredAt
        && previous.matchId.localeCompare(point.matchId) < 0
      );
  });
}

function isBounds(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length === 2
    && finiteNumber(value[0])
    && finiteNumber(value[1])
    && value[0] <= value[1];
}

function isPerson(value: unknown) {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string";
}

function isGroup(value: unknown) {
  return isPerson(value);
}

function isCurrent(value: unknown) {
  return isRecord(value)
    && finiteNumber(value.rating)
    && finiteNumber(value.rd)
    && value.rd > 0
    && nonNegativeInteger(value.rank)
    && nonNegativeInteger(value.rankedPlayerCount)
    && value.rank <= value.rankedPlayerCount;
}

function validRatingVersion(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9]\d*)$/.test(value);
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function uniqueStrings(values: string[]) {
  return new Set(values).size === values.length;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
