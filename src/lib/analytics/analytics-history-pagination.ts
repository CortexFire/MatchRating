import { type AnalyticsPeriod } from "./analytics-policy";

export type AnalyticsHistoryCursor = {
  groupId: string;
  playerId: string;
  period: AnalyticsPeriod;
  asOf: string;
  ratingVersion: string;
  occurredAt: string;
  matchId: string;
};

export type AnalyticsHistoryRequestInput = {
  groupId: string;
  playerId: string;
  period?: string | null;
  asOf?: string | null;
  ratingVersion?: string | null;
  cursor?: string | null;
};

export type NormalizedAnalyticsHistoryRequest = {
  groupId: string;
  playerId: string;
  period: AnalyticsPeriod;
  asOf: string | null;
  ratingVersion: string | null;
  cursor: Pick<AnalyticsHistoryCursor, "occurredAt" | "matchId"> | null;
};

export class AnalyticsHistoryInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalyticsHistoryInputError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PERIODS = new Set<AnalyticsPeriod>(["all", "30d", "90d", "1y"]);
const RATING_VERSION_PATTERN = /^(0|[1-9]\d*)$/;

export function encodeAnalyticsHistoryCursor(cursor: AnalyticsHistoryCursor) {
  return Buffer.from(JSON.stringify({
    v: 1,
    groupId: cursor.groupId,
    playerId: cursor.playerId,
    period: cursor.period,
    asOf: cursor.asOf,
    ratingVersion: cursor.ratingVersion,
    occurredAt: cursor.occurredAt,
    matchId: cursor.matchId,
  }), "utf8").toString("base64url");
}

export function decodeAnalyticsHistoryCursor(cursor: string): AnalyticsHistoryCursor {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<string, unknown>;
    if (
      value.v !== 1
      || typeof value.groupId !== "string"
      || !UUID_PATTERN.test(value.groupId)
      || typeof value.playerId !== "string"
      || !UUID_PATTERN.test(value.playerId)
      || !isAnalyticsPeriod(value.period)
      || !validTimestamp(value.asOf)
      || !validRatingVersion(value.ratingVersion)
      || !validTimestamp(value.occurredAt)
      || typeof value.matchId !== "string"
      || !UUID_PATTERN.test(value.matchId)
    ) {
      throw new Error("invalid payload");
    }
    const decoded: AnalyticsHistoryCursor = {
      groupId: value.groupId,
      playerId: value.playerId,
      period: value.period,
      asOf: value.asOf,
      ratingVersion: value.ratingVersion,
      occurredAt: value.occurredAt,
      matchId: value.matchId,
    };
    if (encodeAnalyticsHistoryCursor(decoded) !== cursor) {
      throw new Error("non-canonical payload");
    }
    return decoded;
  } catch {
    throw new AnalyticsHistoryInputError("Invalid analytics history cursor");
  }
}

export function normalizeAnalyticsHistoryRequest(
  input: AnalyticsHistoryRequestInput,
): NormalizedAnalyticsHistoryRequest {
  if (!UUID_PATTERN.test(input.groupId)) {
    throw new AnalyticsHistoryInputError("Invalid group ID");
  }
  if (!UUID_PATTERN.test(input.playerId)) {
    throw new AnalyticsHistoryInputError("Invalid player ID");
  }

  const period = input.period?.trim();
  if (!isAnalyticsPeriod(period)) {
    throw new AnalyticsHistoryInputError("Invalid analytics period");
  }

  const suppliedAsOf = input.asOf?.trim() || null;
  if (suppliedAsOf !== null && !validTimestamp(suppliedAsOf)) {
    throw new AnalyticsHistoryInputError("Invalid analytics as-of timestamp");
  }

  const suppliedRatingVersion = input.ratingVersion?.trim() || null;
  if (suppliedRatingVersion !== null && !validRatingVersion(suppliedRatingVersion)) {
    throw new AnalyticsHistoryInputError("Invalid analytics rating version");
  }
  if ((suppliedAsOf === null) !== (suppliedRatingVersion === null)) {
    throw new AnalyticsHistoryInputError("Analytics as-of and rating version must be provided together");
  }

  const decoded = input.cursor ? decodeAnalyticsHistoryCursor(input.cursor) : null;
  if (decoded && (
    decoded.groupId !== input.groupId
    || decoded.playerId !== input.playerId
    || decoded.period !== period
    || (suppliedAsOf !== null && decoded.asOf !== suppliedAsOf)
    || (suppliedRatingVersion !== null && decoded.ratingVersion !== suppliedRatingVersion)
  )) {
    throw new AnalyticsHistoryInputError("Analytics history cursor does not match this request");
  }

  return {
    groupId: input.groupId,
    playerId: input.playerId,
    period,
    asOf: decoded?.asOf ?? suppliedAsOf,
    ratingVersion: decoded?.ratingVersion ?? suppliedRatingVersion,
    cursor: decoded
      ? { occurredAt: decoded.occurredAt, matchId: decoded.matchId }
      : null,
  };
}

function isAnalyticsPeriod(value: unknown): value is AnalyticsPeriod {
  return typeof value === "string" && PERIODS.has(value as AnalyticsPeriod);
}

function validRatingVersion(value: unknown): value is string {
  return typeof value === "string" && RATING_VERSION_PATTERN.test(value);
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}
