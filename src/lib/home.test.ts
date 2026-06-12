import { describe, expect, test } from "vitest";
import {
  getCurrentGames,
  getPendingReviewMatches,
  getTimeGreeting,
} from "./home";
import { demoCurrentGames, demoMatches } from "./demo-data";

describe("home screen helpers", () => {
  test("chooses the greeting for the local time of day", () => {
    expect(getTimeGreeting(new Date("2026-06-11T08:00:00"))).toBe("Good morning");
    expect(getTimeGreeting(new Date("2026-06-11T13:00:00"))).toBe("Good afternoon");
    expect(getTimeGreeting(new Date("2026-06-11T19:00:00"))).toBe("Good evening");
  });

  test("returns matches pending review and in-progress games", () => {
    const pending = getPendingReviewMatches(demoMatches);
    const currentGames = getCurrentGames(demoCurrentGames);

    expect(pending).toHaveLength(3);
    expect(pending.every((match) => match.status === "Pending confirmation")).toBe(true);
    expect(currentGames).toHaveLength(2);
    expect(currentGames.every((game) => game.status === "In progress")).toBe(true);
  });
});
