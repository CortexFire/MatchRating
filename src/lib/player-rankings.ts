type GroupListPlayer = {
  id: string;
  name: string;
  rating: number;
  gamesPlayed: number;
};

export function rankGroupListPlayers<T extends GroupListPlayer>(players: T[]): Array<T & { rank: number }> {
  let nextRank = 0;

  return [...players]
    .sort((left, right) => {
      const leftIsRanked = left.gamesPlayed > 0;
      const rightIsRanked = right.gamesPlayed > 0;

      if (leftIsRanked !== rightIsRanked) return leftIsRanked ? -1 : 1;
      if (leftIsRanked) {
        return right.rating - left.rating
          || left.name.localeCompare(right.name)
          || left.id.localeCompare(right.id);
      }

      return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
    })
    .map((player) => ({
      ...player,
      rank: player.gamesPlayed > 0 ? ++nextRank : 0,
    }));
}
