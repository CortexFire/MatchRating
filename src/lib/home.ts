import { type DemoCurrentGame, type DemoMatch } from "./demo-data";

export type HomePendingReviewSummary = {
  id: string;
  summary: string;
  details: string;
  score: string;
  format: string;
};

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

export function getPrimaryCurrentGame(games: DemoCurrentGame[]) {
  return getCurrentGames(games)[0];
}

export function splitCurrentGameTeams(game: DemoCurrentGame) {
  const teamSize = Math.ceil(game.players.length / 2);

  return {
    teamA: game.players.slice(0, teamSize),
    teamB: game.players.slice(teamSize),
  };
}

export function toPendingReviewSummary(match: DemoMatch): HomePendingReviewSummary {
  const winningTeam = match.winnerTeam === "A" ? match.teamA : match.teamB;
  const losingTeam = match.winnerTeam === "A" ? match.teamB : match.teamA;

  return {
    id: match.id,
    summary: `${shortTeamName(winningTeam)} def. ${shortTeamName(losingTeam)}`,
    details: `${match.submittedAt} @ Downtown Rec`,
    score: match.scores[0].replace(/\s*-\s*/, " - "),
    format: `Best of ${match.scores.length}`,
  };
}

function shortTeamName(players: string[]) {
  return players.map((player) => player.split(" ")[0]).join("/");
}
