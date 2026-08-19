import { expect, test, vi } from "vitest";
import ReviewMatchesPage from "./page";

const navigationMocks = vi.hoisted(() => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("next/navigation", () => navigationMocks);

test("redirects the retired manual-review route to match history", () => {
  expect(() => ReviewMatchesPage()).toThrow("NEXT_REDIRECT");
  expect(navigationMocks.redirect).toHaveBeenCalledWith("/matches/history");
});
