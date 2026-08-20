import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  projectPlayerAnalytics,
  type AnalyticsFactsPayload,
  type PlayerAnalyticsViewModel,
} from "./analytics-policy";

export async function getPlayerAnalyticsData(
  groupId: string,
  playerId: string,
): Promise<PlayerAnalyticsViewModel | null> {
  if (!isUuid(groupId) || !isUuid(playerId)) return null;

  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("get_player_analytics_facts", {
    p_group_id: groupId,
    p_user_id: playerId,
  });
  if (error) throw error;
  if (data === null) return null;
  if (!isAnalyticsFactsPayload(data)) {
    throw new Error("get_player_analytics_facts returned an invalid payload");
  }
  return projectPlayerAnalytics(data);
}

function isAnalyticsFactsPayload(value: unknown): value is AnalyticsFactsPayload {
  if (!isRecord(value) || (value.status !== "ready" && value.status !== "updating")) return false;
  if (
    typeof value.asOf !== "string"
    || typeof value.viewerUserId !== "string"
    || !isPerson(value.subject)
    || !isGroup(value.group)
    || !Array.isArray(value.availableGroups)
    || !value.availableGroups.every(isGroup)
  ) return false;
  if (value.status === "updating") return true;
  return isCurrent(value.current)
    && Array.isArray(value.activePlayerIds)
    && value.activePlayerIds.every((id) => typeof id === "string")
    && Array.isArray(value.matches)
    && value.matches.every(isMatch)
    && Array.isArray(value.cohortDaily)
    && value.cohortDaily.every(isCohortDaily)
    && Array.isArray(value.cohortPartners)
    && value.cohortPartners.every(isCohortPartner);
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
    && Number.isSafeInteger(value.rank)
    && Number.isSafeInteger(value.rankedPlayerCount);
}

function isMatch(value: unknown) {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.occurredAt === "string"
    && (value.format === "singles" || value.format === "doubles")
    && typeof value.matchWon === "boolean"
    && Number.isSafeInteger(value.gameCount)
    && Number.isSafeInteger(value.gameWins)
    && finiteNumber(value.expectedGameWins)
    && finiteNumber(value.ratingBefore)
    && finiteNumber(value.rdBefore)
    && finiteNumber(value.ratingAfter)
    && finiteNumber(value.rdAfter)
    && finiteNumber(value.ratingDelta)
    && Array.isArray(value.partners)
    && value.partners.every(isPerson)
    && Array.isArray(value.opponents)
    && value.opponents.every(isPerson);
}

function isCohortDaily(value: unknown) {
  return isRecord(value)
    && typeof value.userId === "string"
    && typeof value.statDate === "string"
    && Number.isSafeInteger(value.matchCount)
    && finiteNumber(value.ratingDelta)
    && Number.isSafeInteger(value.doublesMatchCount);
}

function isCohortPartner(value: unknown) {
  return isRecord(value)
    && typeof value.userId === "string"
    && typeof value.relatedUserId === "string"
    && typeof value.statDate === "string";
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
