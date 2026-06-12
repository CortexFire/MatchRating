import { z } from "zod";

export type MatchFormat = "singles" | "doubles";
export type Team = "A" | "B";

export type MatchGameInput = {
  teamAScore: number;
  teamBScore: number;
};

export type MatchSubmissionInput = {
  groupId: string;
  format: MatchFormat;
  teamAUserIds: string[];
  teamBUserIds: string[];
  games: MatchGameInput[];
};

export type ValidatedMatchSubmission = Omit<MatchSubmissionInput, "games"> & {
  games: Array<MatchGameInput & { winnerTeam: Team; gameNumber: number }>;
  teamAGameWins: number;
  teamBGameWins: number;
  matchWinnerTeam: Team;
};

const gameSchema = z.object({
  teamAScore: z.coerce.number().int().min(0).max(99),
  teamBScore: z.coerce.number().int().min(0).max(99),
});

const submissionSchema = z.object({
  groupId: z.string().min(1),
  format: z.enum(["singles", "doubles"]),
  teamAUserIds: z.array(z.string().min(1)),
  teamBUserIds: z.array(z.string().min(1)),
  games: z.array(gameSchema).min(1).max(7),
});

function assertUniquePlayers(playerIds: string[]) {
  if (new Set(playerIds).size !== playerIds.length) {
    throw new Error("A match cannot contain duplicate players.");
  }
}

function expectedTeamSize(format: MatchFormat) {
  return format === "singles" ? 1 : 2;
}

export function validateMatchSubmission(
  input: MatchSubmissionInput,
  options: { activeMemberIds?: string[] } = {},
): ValidatedMatchSubmission {
  const parsed = submissionSchema.parse(input);
  const teamSize = expectedTeamSize(parsed.format);

  if (
    parsed.teamAUserIds.length !== teamSize ||
    parsed.teamBUserIds.length !== teamSize
  ) {
    throw new Error(
      `${parsed.format} matches require ${teamSize} player${teamSize === 1 ? "" : "s"} per team.`,
    );
  }

  const allPlayers = [...parsed.teamAUserIds, ...parsed.teamBUserIds];
  assertUniquePlayers(allPlayers);

  if (options.activeMemberIds) {
    const activeMembers = new Set(options.activeMemberIds);
    const inactive = allPlayers.find((playerId) => !activeMembers.has(playerId));
    if (inactive) {
      throw new Error(`Player ${inactive} is not an active member of this group.`);
    }
  }

  let teamAGameWins = 0;
  let teamBGameWins = 0;
  const games = parsed.games.map((game, index) => {
    if (game.teamAScore === game.teamBScore) {
      throw new Error("Badminton games must have one winner; tied scores are not allowed.");
    }

    const winnerTeam = game.teamAScore > game.teamBScore ? "A" : "B";
    if (winnerTeam === "A") {
      teamAGameWins += 1;
    } else {
      teamBGameWins += 1;
    }

    return {
      ...game,
      winnerTeam,
      gameNumber: index + 1,
    } satisfies MatchGameInput & { winnerTeam: Team; gameNumber: number };
  });

  if (teamAGameWins === teamBGameWins) {
    throw new Error("A best-of-n match must produce one match winner.");
  }

  return {
    ...parsed,
    games,
    teamAGameWins,
    teamBGameWins,
    matchWinnerTeam: teamAGameWins > teamBGameWins ? "A" : "B",
  };
}
