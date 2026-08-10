import type { MatchView } from "./read-model";

export type PendingReviewMatch = {
  id: string;
  groupId: string;
  summary: string;
  details: string;
  score: string;
  format: string;
};

export function toPendingReviewMatch(match: MatchView): PendingReviewMatch {
  const winning = match.winnerTeam === "A" ? match.teamA : match.teamB;
  const losing = match.winnerTeam === "A" ? match.teamB : match.teamA;
  const winningGames = match.games.filter(
    (game) => game.winnerTeam === match.winnerTeam,
  ).length;
  const losingGames = match.games.length - winningGames;

  return {
    id: match.id,
    groupId: match.groupId,
    summary: `${shortTeamName(winning)} def. ${shortTeamName(losing)}`,
    details: `${formatSubmittedAt(match.submittedAt)} @ ${match.groupName}`,
    score: match.games.length ? `${winningGames} - ${losingGames}` : "—",
    format: match.format === "singles" ? "Singles" : "Doubles",
  };
}

function shortTeamName(players: MatchView["teamA"]) {
  return players.map((player) => player.name.split(" ")[0]).join("/");
}

function formatSubmittedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Los_Angeles",
  }).format(new Date(value));
}
