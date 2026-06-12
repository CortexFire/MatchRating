import { type DemoCurrentGame, type DemoMatch } from "./demo-data";

export function getTimeGreeting(date = new Date()) {
  const hour = date.getHours();

  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 17) {
    return "Good afternoon";
  }

  return "Good evening";
}

export function getPendingReviewMatches(matches: DemoMatch[]) {
  return matches.filter((match) => match.status === "Pending confirmation");
}

export function getCurrentGames(games: DemoCurrentGame[]) {
  return games.filter((game) => game.status === "In progress");
}
