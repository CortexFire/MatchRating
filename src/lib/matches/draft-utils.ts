import { type ActiveMatchDraftInput } from "./drafts";

export function isEmptyActiveMatchDraft(draft: ActiveMatchDraftInput) {
  const hasPlayers = draft.teamAUserIds.length > 0 || draft.teamBUserIds.length > 0;
  const hasScores = draft.games.some(
    (game) => game.teamAScore !== null || game.teamBScore !== null,
  );
  return !hasPlayers && !hasScores;
}
