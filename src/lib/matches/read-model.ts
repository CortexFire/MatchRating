export type MatchStatus = "pending_confirmation" | "confirmed" | "disputed";
export type MatchFormat = "singles" | "doubles";
export type TeamCode = "A" | "B";

export type MatchPlayer = {
  id: string;
  name: string;
  initials: string;
};

export type MatchGame = {
  gameNumber: number;
  teamAScore: number;
  teamBScore: number;
  winnerTeam: TeamCode;
};

export type MatchView = {
  id: string;
  groupId: string;
  groupName: string;
  revisionId: string;
  submittedByUserId: string;
  status: MatchStatus;
  submittedAt: string;
  format: MatchFormat;
  teamA: MatchPlayer[];
  teamB: MatchPlayer[];
  games: MatchGame[];
  winnerTeam: TeamCode;
  ratingSummary: string;
  canReview: boolean;
  canRevise: boolean;
};

export type MatchReadRows = {
  currentUserId: string;
  groups: Array<{ id: string; name: string }>;
  matches: Array<{ id: string; group_id: string; active_revision_id: string; status: MatchStatus; submitted_at: string }>;
  revisions: Array<{ id: string; match_id: string; submitted_by_user_id: string; format: MatchFormat }>;
  participants: Array<{ revision_id: string; user_id: string; team: TeamCode; slot: number }>;
  games: Array<{ revision_id: string; game_number: number; team_a_score: number; team_b_score: number; winner_team: TeamCode }>;
  confirmations: Array<{ revision_id: string; user_id: string; action: "confirmed" | "disputed"; created_at: string }>;
  ratingEvents: Array<{ revision_id: string; user_id: string; before_rating: number | string; after_rating: number | string }>;
  profiles: Array<{ id: string; display_name: string }>;
};

export function buildMatchViews(rows: MatchReadRows): MatchView[] {
  const groups = new Map(rows.groups.map((group) => [group.id, group.name]));
  const revisions = new Map(rows.revisions.map((revision) => [revision.id, revision]));
  const profiles = new Map(rows.profiles.map((profile) => [profile.id, profile.display_name]));

  return rows.matches.flatMap((match) => {
    const revision = revisions.get(match.active_revision_id);
    if (!revision || revision.match_id !== match.id) return [];

    const revisionParticipants = rows.participants
      .filter((participant) => participant.revision_id === revision.id)
      .sort((left, right) => left.slot - right.slot);
    const revisionGames = rows.games
      .filter((game) => game.revision_id === revision.id)
      .sort((left, right) => left.game_number - right.game_number)
      .map((game) => ({
        gameNumber: game.game_number,
        teamAScore: game.team_a_score,
        teamBScore: game.team_b_score,
        winnerTeam: game.winner_team,
      }));
    const toPlayer = (participant: MatchReadRows["participants"][number]): MatchPlayer => {
      const name = profiles.get(participant.user_id) ?? "Unknown player";
      return { id: participant.user_id, name, initials: initialsFor(name) };
    };
    const submitterTeam = revisionParticipants.find((participant) => participant.user_id === revision.submitted_by_user_id)?.team;
    const currentParticipant = revisionParticipants.find((participant) => participant.user_id === rows.currentUserId);
    const alreadyReviewed = rows.confirmations.some(
      (confirmation) => confirmation.revision_id === revision.id && confirmation.user_id === rows.currentUserId,
    );
    const ratingCount = rows.ratingEvents.filter((event) => event.revision_id === revision.id).length;
    const teamAWins = revisionGames.filter((game) => game.winnerTeam === "A").length;
    const teamBWins = revisionGames.length - teamAWins;

    return [{
      id: match.id,
      groupId: match.group_id,
      groupName: groups.get(match.group_id) ?? "Group",
      revisionId: revision.id,
      submittedByUserId: revision.submitted_by_user_id,
      status: match.status,
      submittedAt: match.submitted_at,
      format: revision.format,
      teamA: revisionParticipants.filter((participant) => participant.team === "A").map(toPlayer),
      teamB: revisionParticipants.filter((participant) => participant.team === "B").map(toPlayer),
      games: revisionGames,
      winnerTeam: teamAWins > teamBWins ? "A" : "B",
      ratingSummary: ratingCount ? `${ratingCount} rating ${ratingCount === 1 ? "change" : "changes"}` : "Ratings updating…",
      canReview: match.status === "pending_confirmation"
        && Boolean(currentParticipant && submitterTeam && currentParticipant.team !== submitterTeam)
        && !alreadyReviewed,
      canRevise: Boolean(currentParticipant),
    } satisfies MatchView];
  });
}

function initialsFor(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}
