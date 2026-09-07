import { describe, expect, test } from "vitest";
import {
  AnalyticsHistoryInputError,
  decodeAnalyticsHistoryCursor,
  encodeAnalyticsHistoryCursor,
  normalizeAnalyticsHistoryRequest,
} from "./analytics-history-pagination";

const groupId = "11111111-1111-4111-8111-111111111111";
const playerId = "22222222-2222-4222-8222-222222222222";
const matchId = "33333333-3333-4333-8333-333333333333";
const asOf = "2026-08-19T12:00:00.000Z";
const maxRatingVersion = "9223372036854775807";
const overflowingRatingVersion = "9223372036854775808";

describe("analytics exact-history cursor", () => {
  test("round-trips the complete snapshot and descending tuple identity", () => {
    const value = {
      groupId,
      playerId,
      period: "90d" as const,
      asOf,
      ratingVersion: "17",
      occurredAt: "2026-08-18T12:00:00.000Z",
      matchId,
    };

    expect(decodeAnalyticsHistoryCursor(encodeAnalyticsHistoryCursor(value))).toEqual(value);
  });

  test("accepts PostgreSQL's maximum bigint rating version", () => {
    const value = {
      groupId,
      playerId,
      period: "all" as const,
      asOf,
      ratingVersion: maxRatingVersion,
      occurredAt: "2026-08-18T12:00:00.000Z",
      matchId,
    };

    expect(decodeAnalyticsHistoryCursor(encodeAnalyticsHistoryCursor(value))).toEqual(value);
  });

  test("rejects a cursor rating version above PostgreSQL bigint", () => {
    const cursor = encodeAnalyticsHistoryCursor({
      groupId,
      playerId,
      period: "all",
      asOf,
      ratingVersion: overflowingRatingVersion,
      occurredAt: "2026-08-18T12:00:00.000Z",
      matchId,
    });

    expect(() => decodeAnalyticsHistoryCursor(cursor)).toThrow(AnalyticsHistoryInputError);
  });

  test.each([
    ["malformed encoding", "not-json"],
    ["noncanonical encoding", Buffer.from(JSON.stringify({ v: 1 }), "utf8").toString("base64")],
    ["wrong cursor version", Buffer.from(JSON.stringify({
      v: 2, groupId, playerId, period: "90d", asOf, ratingVersion: "17",
      occurredAt: "2026-08-18T12:00:00.000Z", matchId,
    }), "utf8").toString("base64url")],
  ])("rejects %s", (_label, cursor) => {
    expect(() => decodeAnalyticsHistoryCursor(cursor)).toThrow(AnalyticsHistoryInputError);
  });
});

describe("analytics exact-history request normalization", () => {
  test("accepts PostgreSQL's maximum bigint rating version", () => {
    expect(normalizeAnalyticsHistoryRequest({
      groupId,
      playerId,
      period: "all",
      asOf,
      ratingVersion: maxRatingVersion,
    })).toMatchObject({ ratingVersion: maxRatingVersion });
  });

  test("binds a cursor to the route identifiers, period, as-of time, and rating version", () => {
    const cursor = encodeAnalyticsHistoryCursor({
      groupId,
      playerId,
      period: "30d",
      asOf,
      ratingVersion: "17",
      occurredAt: "2026-08-18T12:00:00.000Z",
      matchId,
    });

    expect(normalizeAnalyticsHistoryRequest({
      groupId,
      playerId,
      period: "30d",
      asOf,
      ratingVersion: "17",
      cursor,
    })).toEqual({
      groupId,
      playerId,
      period: "30d",
      asOf,
      ratingVersion: "17",
      cursor: { occurredAt: "2026-08-18T12:00:00.000Z", matchId },
    });
  });

  test.each([
    ["group", { groupId: "44444444-4444-4444-8444-444444444444" }],
    ["player", { playerId: "44444444-4444-4444-8444-444444444444" }],
    ["period", { period: "1y" }],
    ["as-of", { asOf: "2026-08-20T12:00:00.000Z" }],
    ["rating version", { ratingVersion: "18" }],
  ])("rejects a cursor bound to another %s", (_label, overrides) => {
    const cursor = encodeAnalyticsHistoryCursor({
      groupId,
      playerId,
      period: "30d",
      asOf,
      ratingVersion: "17",
      occurredAt: "2026-08-18T12:00:00.000Z",
      matchId,
    });

    expect(() => normalizeAnalyticsHistoryRequest({
      groupId,
      playerId,
      period: "30d",
      asOf,
      ratingVersion: "17",
      cursor,
      ...overrides,
    })).toThrow("Analytics history cursor does not match this request");
  });

  test.each([
    [{ groupId: "bad", playerId, period: "all" }, "Invalid group ID"],
    [{ groupId, playerId: "bad", period: "all" }, "Invalid player ID"],
    [{ groupId, playerId, period: "weekly" }, "Invalid analytics period"],
    [{ groupId, playerId, period: "all", asOf: "yesterday" }, "Invalid analytics as-of timestamp"],
    [{ groupId, playerId, period: "all", ratingVersion: "1.5" }, "Invalid analytics rating version"],
    [{ groupId, playerId, period: "all", asOf, ratingVersion: overflowingRatingVersion }, "Invalid analytics rating version"],
  ])("rejects malformed input", (input, message) => {
    expect(() => normalizeAnalyticsHistoryRequest(input)).toThrow(message);
  });
});
