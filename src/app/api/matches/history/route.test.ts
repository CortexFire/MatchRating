import { beforeEach, describe, expect, test, vi } from "vitest";
import { MatchHistoryInputError } from "@/lib/matches/history-pagination";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  listMatchHistoryPage: vi.fn(),
}));

vi.mock("@/lib/app-data", () => ({
  listMatchHistoryPage: mocks.listMatchHistoryPage,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listMatchHistoryPage.mockResolvedValue({ matches: [], nextCursor: null });
});

describe("match history route", () => {
  test("returns a private uncached page for normalized query parameters", async () => {
    const response = await GET(new Request(
      "https://matches.example.com/api/matches/history?groupId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&status=disputed&q=Bea&cursor=opaque",
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.listMatchHistoryPage).toHaveBeenCalledWith({
      groupId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status: "disputed",
      search: "Bea",
      cursor: "opaque",
    });
    await expect(response.json()).resolves.toEqual({ matches: [], nextCursor: null });
  });

  test.each([
    [new MatchHistoryInputError("Invalid match history cursor"), 400, "Invalid match history cursor"],
    [new Error("You must be signed in to do that."), 401, "Unauthorized"],
    [{ code: "MR403", message: "Not an active group member" }, 403, "Forbidden"],
    [new Error("database unavailable"), 500, "Could not load match history"],
  ])("maps history failures without leaking unexpected details", async (error, status, message) => {
    mocks.listMatchHistoryPage.mockRejectedValue(error);

    const response = await GET(new Request("https://matches.example.com/api/matches/history"));

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ message });
  });
});
