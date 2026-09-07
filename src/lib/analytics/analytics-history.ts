import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAnalyticsRatingPoint } from "./analytics-read-model";
import {
  encodeAnalyticsHistoryCursor,
  normalizeAnalyticsHistoryRequest,
  type AnalyticsHistoryRequestInput,
} from "./analytics-history-pagination";
import { type AnalyticsRatingPoint } from "./analytics-policy";

export type ExactAnalyticsHistoryPage = {
  points: AnalyticsRatingPoint[];
  nextCursor: string | null;
  asOf: string;
  ratingVersion: string;
};

export class AnalyticsHistoryVersionConflictError extends Error {
  readonly code = "MR409";

  constructor() {
    super("Rating version changed");
    this.name = "AnalyticsHistoryVersionConflictError";
  }
}

export async function listExactAnalyticsHistoryPage(
  input: AnalyticsHistoryRequestInput,
): Promise<ExactAnalyticsHistoryPage> {
  const request = normalizeAnalyticsHistoryRequest(input);
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("get_player_analytics_history_v2", {
    p_group_id: request.groupId,
    p_user_id: request.playerId,
    p_period: request.period,
    p_as_of: request.asOf,
    p_rating_version: request.ratingVersion,
    p_cursor_occurred_at: request.cursor?.occurredAt ?? null,
    p_cursor_match_id: request.cursor?.matchId ?? null,
    p_page_size: 50,
  });

  if (error) {
    if (errorCode(error) === "MR409") {
      throw new AnalyticsHistoryVersionConflictError();
    }
    throw error;
  }
  if (!isHistoryRpcPayload(data)) {
    throw new Error("get_player_analytics_history_v2 returned an invalid payload");
  }

  const lastPoint = data.points.at(-1);
  const nextCursor = data.hasMore && lastPoint
    ? encodeAnalyticsHistoryCursor({
      groupId: request.groupId,
      playerId: request.playerId,
      period: request.period,
      asOf: data.asOf,
      ratingVersion: data.ratingVersion,
      occurredAt: lastPoint.occurredAt,
      matchId: lastPoint.matchId,
    })
    : null;

  return {
    points: data.points,
    nextCursor,
    asOf: data.asOf,
    ratingVersion: data.ratingVersion,
  };
}

type HistoryRpcPayload = {
  asOf: string;
  ratingVersion: string;
  points: AnalyticsRatingPoint[];
  hasMore: boolean;
};

function isHistoryRpcPayload(value: unknown): value is HistoryRpcPayload {
  if (
    !isRecord(value)
    || !validTimestamp(value.asOf)
    || !validRatingVersion(value.ratingVersion)
    || typeof value.hasMore !== "boolean"
    || !Array.isArray(value.points)
    || value.points.length > 50
    || !value.points.every(isAnalyticsRatingPoint)
    || (value.hasMore && value.points.length === 0)
  ) return false;

  const points = value.points;
  return points.every((point, index) => {
    if (!index) return true;
    const previous = points[index - 1];
    const previousTime = Date.parse(previous.occurredAt);
    const currentTime = Date.parse(point.occurredAt);
    return previousTime > currentTime
      || (previousTime === currentTime && previous.matchId.localeCompare(point.matchId) > 0);
  });
}

function validRatingVersion(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9]\d*)$/.test(value);
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
