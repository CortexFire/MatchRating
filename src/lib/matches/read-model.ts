export type MatchStatus = "pending_confirmation" | "confirmed" | "disputed";
export type MatchFormat = "singles" | "doubles";
export type TeamCode = "A" | "B";

export type MatchPlayer = {
  id: string;
  name: string;
  initials: string;
  ratingChange?: {
    previous: { rating: number; rd: number };
    next: { rating: number; rd: number };
  };
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
  correctionStartedAt: string;
  correctionUntil: string;
  format: MatchFormat;
  teamA: MatchPlayer[];
  teamB: MatchPlayer[];
  games: MatchGame[];
  winnerTeam: TeamCode;
  ratingSummary: string;
  canCorrect: boolean;
  canRevise: boolean;
};

export type MatchReadRows = {
  currentUserId: string;
  currentUserAdminGroupIds: string[];
  groups: Array<{ id: string; name: string }>;
  matches: Array<{ id: string; group_id: string; active_revision_id: string; status: MatchStatus; submitted_at: string; review_started_at: string }>;
  revisions: Array<{ id: string; match_id: string; submitted_by_user_id: string; format: MatchFormat }>;
  participants: Array<{ revision_id: string; user_id: string; team: TeamCode; slot: number }>;
  games: Array<{ revision_id: string; game_number: number; team_a_score: number; team_b_score: number; winner_team: TeamCode }>;
  ratingEvents: Array<{
    revision_id: string;
    user_id: string;
    sequence: number | string;
    before_rating: number | string;
    before_rd: number | string;
    after_rating: number | string;
    after_rd: number | string;
  }>;
  profiles: Array<{ id: string; display_name: string }>;
};

export function buildMatchViews(rows: MatchReadRows): MatchView[] {
  const groups = new Map(rows.groups.map((group) => [group.id, group.name]));
  const adminGroupIds = new Set(rows.currentUserAdminGroupIds);
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
    const ratingEventsByUser = new Map<string, { first: MatchReadRows["ratingEvents"][number]; last: MatchReadRows["ratingEvents"][number] }>();
    for (const event of rows.ratingEvents) {
      if (event.revision_id !== revision.id) continue;
      const current = ratingEventsByUser.get(event.user_id);
      const sequence = Number(event.sequence);
      if (!current) {
        ratingEventsByUser.set(event.user_id, { first: event, last: event });
      } else {
        if (sequence < Number(current.first.sequence)) current.first = event;
        if (sequence > Number(current.last.sequence)) current.last = event;
      }
    }
    const toPlayer = (participant: MatchReadRows["participants"][number]): MatchPlayer => {
      const name = profiles.get(participant.user_id) ?? "Unknown player";
      const events = ratingEventsByUser.get(participant.user_id);
      return {
        id: participant.user_id,
        name,
        initials: initialsFor(name),
        ...(events ? {
          ratingChange: {
            previous: { rating: Math.round(Number(events.first.before_rating)), rd: Math.round(Number(events.first.before_rd)) },
            next: { rating: Math.round(Number(events.last.after_rating)), rd: Math.round(Number(events.last.after_rd)) },
          },
        } : {}),
      };
    };
    const currentParticipant = revisionParticipants.find((participant) => participant.user_id === rows.currentUserId);
    const canModerate = adminGroupIds.has(match.group_id);
    const ratingCount = rows.ratingEvents.filter((event) => event.revision_id === revision.id).length;
    const teamAWins = revisionGames.filter((game) => game.winnerTeam === "A").length;
    const teamBWins = revisionGames.length - teamAWins;
    const correctionUntil = new Date(new Date(match.review_started_at).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const correctionWindowOpen = Date.now() < new Date(correctionUntil).getTime();

    return [{
      id: match.id,
      groupId: match.group_id,
      groupName: groups.get(match.group_id) ?? "Group",
      revisionId: revision.id,
      submittedByUserId: revision.submitted_by_user_id,
      status: match.status,
      submittedAt: match.submitted_at,
      correctionStartedAt: match.review_started_at,
      correctionUntil,
      format: revision.format,
      teamA: revisionParticipants.filter((participant) => participant.team === "A").map(toPlayer),
      teamB: revisionParticipants.filter((participant) => participant.team === "B").map(toPlayer),
      games: revisionGames,
      winnerTeam: teamAWins > teamBWins ? "A" : "B",
      ratingSummary: ratingCount ? `${ratingCount} rating ${ratingCount === 1 ? "change" : "changes"}` : "Ratings updating…",
      canCorrect: Boolean(currentParticipant || canModerate)
        && correctionWindowOpen
        && (match.status === "pending_confirmation" || match.status === "confirmed"),
      canRevise: Boolean(currentParticipant || canModerate)
        && correctionWindowOpen
        && match.status === "disputed",
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
