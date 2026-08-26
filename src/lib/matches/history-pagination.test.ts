import { describe, expect, test } from "vitest";
import {
  decodeMatchHistoryCursor,
  encodeMatchHistoryCursor,
  normalizeMatchHistoryRequest,
} from "./history-pagination";

const MATCH_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GROUP_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PLAYER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("match history pagination inputs", () => {
  test("round-trips an opaque versioned cursor", () => {
    const cursor = encodeMatchHistoryCursor({
      submittedAt: "2026-08-13T12:00:00.000Z",
      id: MATCH_ID,
    });

    expect(cursor).not.toContain("2026-08-13");
    expect(decodeMatchHistoryCursor(cursor)).toEqual({
      submittedAt: "2026-08-13T12:00:00.000Z",
      id: MATCH_ID,
    });
  });

  test("rejects malformed cursors instead of silently restarting pagination", () => {
    expect(() => decodeMatchHistoryCursor("not-a-cursor")).toThrow("Invalid match history cursor");
    const cursor = encodeMatchHistoryCursor({
      submittedAt: "2026-08-13T12:00:00.000Z",
      id: MATCH_ID,
    });
    expect(() => decodeMatchHistoryCursor(`${cursor}!`)).toThrow("Invalid match history cursor");
  });

  test("normalizes empty search and validates status and search length", () => {
    expect(normalizeMatchHistoryRequest({ search: "   " })).toEqual({
      groupId: null,
      playerId: null,
      status: null,
      search: null,
      cursor: null,
    });
    expect(normalizeMatchHistoryRequest({ status: "disputed", search: "  Bea Rivera  " })).toMatchObject({
      status: "disputed",
      search: "Bea Rivera",
    });
    expect(() => normalizeMatchHistoryRequest({ status: "unknown" })).toThrow("Invalid match history status");
    expect(() => normalizeMatchHistoryRequest({ search: "x".repeat(81) })).toThrow("Search must be 80 characters or fewer");
  });

  test("normalizes a player only within a selected group", () => {
    expect(normalizeMatchHistoryRequest({ groupId: GROUP_ID, playerId: `  ${PLAYER_ID}  ` })).toMatchObject({
      groupId: GROUP_ID,
      playerId: PLAYER_ID,
    });
    expect(() => normalizeMatchHistoryRequest({ groupId: GROUP_ID, playerId: "not-a-player" })).toThrow("Invalid player ID");
    expect(() => normalizeMatchHistoryRequest({ playerId: PLAYER_ID })).toThrow("Player history requires a group ID");
  });
});
