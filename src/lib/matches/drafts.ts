import { z } from "zod";
import { type MatchFormat, type Team } from "./validation";

export type ActiveMatchDraftGameInput = {
  teamAScore: number | null;
  teamBScore: number | null;
  winnerTeam: Team;
};

export type ActiveMatchDraftInput = {
  groupId: string;
  format: MatchFormat;
  teamAUserIds: string[];
  teamBUserIds: string[];
  games: ActiveMatchDraftGameInput[];
};

const draftSchema = z.object({
  groupId: z.string().min(1),
  format: z.enum(["singles", "doubles"]),
  teamAUserIds: z.array(z.string().min(1)),
  teamBUserIds: z.array(z.string().min(1)),
  games: z
    .array(
      z.object({
        teamAScore: z.number().int().min(0).max(99).nullable(),
        teamBScore: z.number().int().min(0).max(99).nullable(),
        winnerTeam: z.enum(["A", "B"]),
      }),
    )
    .min(1)
    .max(7),
});

export function validateActiveMatchDraft(
  input: ActiveMatchDraftInput,
  options: { activeMemberIds?: string[] } = {},
): ActiveMatchDraftInput {
  const parsed = draftSchema.parse(input);
  const teamSize = parsed.format === "singles" ? 1 : 2;

  if (parsed.teamAUserIds.length > teamSize || parsed.teamBUserIds.length > teamSize) {
    throw new Error(`${parsed.format} drafts allow at most ${teamSize} player${teamSize === 1 ? "" : "s"} per team.`);
  }

  const allPlayers = [...parsed.teamAUserIds, ...parsed.teamBUserIds];
  if (new Set(allPlayers).size !== allPlayers.length) {
    throw new Error("A draft cannot contain duplicate players.");
  }

  if (options.activeMemberIds) {
    const activeMembers = new Set(options.activeMemberIds);
    const inactive = allPlayers.find((playerId) => !activeMembers.has(playerId));
    if (inactive) {
      throw new Error(`Player ${inactive} is not an active member of this group.`);
    }
  }

  return parsed;
}

export function isEmptyActiveMatchDraft(draft: ActiveMatchDraftInput) {
  const hasPlayers = draft.teamAUserIds.length > 0 || draft.teamBUserIds.length > 0;
  const hasScores = draft.games.some(
    (game) => game.teamAScore !== null || game.teamBScore !== null,
  );
  return !hasPlayers && !hasScores;
}

export function draftExpiresAt(now = new Date()) {
  return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

export function isDraftExpired(expiresAt: string, now = new Date()) {
  return Date.parse(expiresAt) <= now.getTime();
}
