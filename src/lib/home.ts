type DemoPlayer = {
  id: string;
  name: string;
};

type DemoCurrentGame = {
  id: string;
  status: "In progress" | "Complete";
  groupName: string;
  players: string[];
  scores?: string[];
  startedAt?: string;
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

export function buildActiveMatchRecordingHref(
  groupId: string,
  game: DemoCurrentGame,
  players: DemoPlayer[],
) {
  const teams = splitCurrentGameTeams(game);
  const playerIdsByName = new Map(players.map((player) => [player.name, player.id]));
  const teamAUserIds = toPlayerIds(teams.teamA, playerIdsByName);
  const teamBUserIds = toPlayerIds(teams.teamB, playerIdsByName);
  const params = new URLSearchParams({
    format: teams.teamA.length === 1 && teams.teamB.length === 1 ? "singles" : "doubles",
    teamA: teamAUserIds.join(","),
    teamB: teamBUserIds.join(","),
  });

  if (game.scores?.length) {
    params.set("scores", game.scores.join(","));
  }

  return `/groups/${groupId}/matches/new?${params.toString()}`;
}

function toPlayerIds(players: string[], playerIdsByName: Map<string, string>) {
  return players
    .map((player) => playerIdsByName.get(player))
    .filter((id): id is string => Boolean(id));
}
