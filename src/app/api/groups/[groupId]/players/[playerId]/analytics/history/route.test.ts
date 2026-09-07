import { beforeEach, describe, expect, test, vi } from "vitest";
import { AnalyticsHistoryVersionConflictError } from "@/lib/analytics/analytics-history";
import { AnalyticsHistoryInputError } from "@/lib/analytics/analytics-history-pagination";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  listExactAnalyticsHistoryPage: vi.fn(),
}));

vi.mock("@/lib/analytics/analytics-history", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analytics/analytics-history")>();
  return { ...actual, listExactAnalyticsHistoryPage: mocks.listExactAnalyticsHistoryPage };
});

const groupId = "11111111-1111-4111-8111-111111111111";
const playerId = "22222222-2222-4222-8222-222222222222";
const context = { params: Promise.resolve({ groupId, playerId }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listExactAnalyticsHistoryPage.mockResolvedValue({
    points: [],
    nextCursor: null,
    asOf: "2026-08-19T12:00:00.000Z",
    ratingVersion: "7",
  });
});

describe("analytics exact-history route", () => {
  test("returns a private uncached page for the path-bound request", async () => {
    const response = await GET(new Request(
      "https://matches.example.com/api/groups/x/players/y/analytics/history"
        + "?period=90d&asOf=2026-08-19T12%3A00%3A00.000Z&ratingVersion=7&cursor=opaque",
    ), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.listExactAnalyticsHistoryPage).toHaveBeenCalledWith({
      groupId,
      playerId,
      period: "90d",
      asOf: "2026-08-19T12:00:00.000Z",
      ratingVersion: "7",
      cursor: "opaque",
    });
    await expect(response.json()).resolves.toEqual({
      points: [],
      nextCursor: null,
      asOf: "2026-08-19T12:00:00.000Z",
      ratingVersion: "7",
    });
  });

  test.each([
    [new AnalyticsHistoryInputError("Invalid analytics period"), 400, "Invalid analytics period"],
    [{ code: "MR401", message: "Authentication required" }, 401, "Unauthorized"],
    [{ code: "MR403", message: "Analytics history is inaccessible" }, 403, "Forbidden"],
    [new AnalyticsHistoryVersionConflictError(), 409, "Ratings changed; refresh analytics"],
    [new Error("database unavailable"), 500, "Could not load analytics history"],
  ])("maps exact-history failures without leaking unexpected details", async (error, status, message) => {
    mocks.listExactAnalyticsHistoryPage.mockRejectedValue(error);

    const response = await GET(
      new Request("https://matches.example.com/api/groups/x/players/y/analytics/history?period=all"),
      context,
    );

    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ message });
  });
});
