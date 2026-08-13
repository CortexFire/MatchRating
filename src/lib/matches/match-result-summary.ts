import type { MatchView } from "./read-model";

export type MatchResultSummary = {
  id: string;
  groupId: string;
  summary: string;
  details: string;
  submittedAt: string;
  groupName: string;
  score: string;
  singleGameScore?: string;
  format: string;
};

export function toMatchResultSummary(match: MatchView): MatchResultSummary {
  const winning = match.winnerTeam === "A" ? match.teamA : match.teamB;
  const losing = match.winnerTeam === "A" ? match.teamB : match.teamA;
  const winningGames = match.games.filter(
    (game) => game.winnerTeam === match.winnerTeam,
  ).length;
  const losingGames = match.games.length - winningGames;
  const submittedAt = formatSubmittedAt(match.submittedAt);
  const singleGame = match.games.length === 1 ? match.games[0] : undefined;
  const singleGameScore = singleGame
    ? match.winnerTeam === "A"
      ? `${singleGame.teamAScore} - ${singleGame.teamBScore}`
      : `${singleGame.teamBScore} - ${singleGame.teamAScore}`
    : undefined;

  return {
    id: match.id,
    groupId: match.groupId,
    summary: `${shortTeamName(winning)} def. ${shortTeamName(losing)}`,
    details: `${submittedAt} @ ${match.groupName}`,
    submittedAt,
    groupName: match.groupName,
    score: match.games.length ? `${winningGames} - ${losingGames}` : "—",
    ...(singleGameScore ? { singleGameScore } : {}),
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
