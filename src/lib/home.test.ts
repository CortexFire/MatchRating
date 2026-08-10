import { describe, expect, test } from "vitest";
import {
  getCurrentGames,
  getPrimaryCurrentGame,
  getTimeGreeting,
  splitCurrentGameTeams,
} from "./home";
import { demoCurrentGames } from "./demo-data";

describe("home screen helpers", () => {
  test("chooses the greeting for the local time of day", () => {
    expect(getTimeGreeting(new Date("2026-06-11T08:00:00"))).toBe("Good morning");
    expect(getTimeGreeting(new Date("2026-06-11T13:00:00"))).toBe("Good afternoon");
    expect(getTimeGreeting(new Date("2026-06-11T19:00:00"))).toBe("Good evening");
  });

  test("returns in-progress games", () => {
    const currentGames = getCurrentGames(demoCurrentGames);

    expect(currentGames).toHaveLength(2);
    expect(currentGames.every((game) => game.status === "In progress")).toBe(true);
  });

  test("returns the first in-progress game as the primary home match", () => {
    const primaryGame = getPrimaryCurrentGame(demoCurrentGames);

    expect(primaryGame?.id).toBe("game-206");
  });

  test("splits current game players into two display teams", () => {
    const primaryGame = getPrimaryCurrentGame(demoCurrentGames);

    expect(primaryGame).toBeDefined();
    expect(splitCurrentGameTeams(primaryGame!)).toEqual({
      teamA: ["Alice Tan", "Cory Shah"],
      teamB: ["Bea Rivera", "Dev Okafor"],
    });
  });

});
