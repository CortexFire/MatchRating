"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Medal, Plus, Trash2, X } from "lucide-react";
import { type ActionResult, type MatchCommandResult } from "@/app/actions";
import { useNavigationSyncRegistration } from "@/components/app/navigation-sync";
import { Button } from "@/components/ui/button";
import {
  PlayerSelectView,
  type PlayerFilter,
  type PlayerSelection,
} from "@/components/match/player-select-view";
import { GroupSwitcher, type GroupOption } from "@/components/match/group-switcher";
import {
  validateMatchSubmission,
  type MatchFormat,
  type MatchGameInput,
  type MatchScoreInput,
  type MatchSubmissionInput,
  type Team,
} from "@/lib/matches/validation";
import {
  type ActiveMatchDraftGameInput,
  type ActiveMatchDraftInput,
  isEmptyActiveMatchDraft,
} from "@/lib/matches/drafts";
import { type AppPlayer } from "@/lib/app-data";
import styles from "./match-recorder.module.css";

type Score = MatchScoreInput;
type EditableScore = number | "";
type RecordedGame = {
  teamAScore: EditableScore;
  teamBScore: EditableScore;
  winnerTeam: Team;
};
type TeamSelection = PlayerSelection;
type CreateGuestPlayers = (input: { groupId: string; names: string[] }) => Promise<ActionResult<{ players: AppPlayer[] }>>;
type SaveActiveMatchDraft = (
  input: ActiveMatchDraftInput & { draftId?: string },
) => Promise<ActionResult<{
  draftId: string | null;
  outcome?: "saved" | "deleted" | "unchanged";
}>>;
type SubmitMatchAction = (input: MatchSubmissionInput & { draftId?: string; commandId: string }) => Promise<ActionResult<MatchCommandResult>>;
type TeamSlot =
  | { id: string; initials: string; name: string; fullName: string; empty?: false }
  | { empty: true };

const defaultMatchRecording: Omit<InitialMatchRecording, "games"> = {
  format: "doubles",
  teamAUserIds: [],
  teamBUserIds: [],
};

export type InitialMatchRecording = {
  format: MatchFormat;
  teamAUserIds: string[];
  teamBUserIds: string[];
  games: Array<{
    teamAScore: number | null;
    teamBScore: number | null;
    winnerTeam?: Team;
  }>;
};

export function MatchRecorder({
  groupId = "test-group",
  groupName = "Downtown Rec",
  groupOptions = [{ id: groupId, name: groupName }],
  players,
  initialMatch,
  draftId,
  canEdit = true,
  createGuestPlayers,
  saveActiveMatchDraft,
  submitMatchAction,
}: {
  groupId?: string;
  groupName?: string;
  groupOptions?: GroupOption[];
  players: AppPlayer[];
  initialMatch?: InitialMatchRecording;
  draftId?: string;
  canEdit?: boolean;
  createGuestPlayers?: CreateGuestPlayers;
  saveActiveMatchDraft?: SaveActiveMatchDraft;
  submitMatchAction?: SubmitMatchAction;
}) {
  const startingMatch = initialMatch ?? defaultMatchRecording;
  const [format, setFormat] = useState<MatchFormat>(startingMatch.format);
  const [teamA, setTeamA] = useState<TeamSelection>(() =>
    normalizeTeamSlots(startingMatch.teamAUserIds, startingMatch.format),
  );
  const [teamB, setTeamB] = useState<TeamSelection>(() =>
    normalizeTeamSlots(startingMatch.teamBUserIds, startingMatch.format),
  );
  const [games, setGames] = useState<RecordedGame[]>(() =>
    initialMatch
      ? initialMatch.games.map((game) => ({
          teamAScore: game.teamAScore ?? "",
          teamBScore: game.teamBScore ?? "",
          winnerTeam: game.winnerTeam ?? winnerFromDraftGame(game),
        }))
      : [newBlankGame()],
  );
  const [playerSelectOpen, setPlayerSelectOpen] = useState(false);
  const [activeSelectTeam, setActiveSelectTeam] = useState<Team>("A");
  const [draftTeamA, setDraftTeamA] = useState<TeamSelection>(() =>
    resizeTeamSlots(startingMatch.teamAUserIds, startingMatch.format),
  );
  const [draftTeamB, setDraftTeamB] = useState<TeamSelection>(() =>
    resizeTeamSlots(startingMatch.teamBUserIds, startingMatch.format),
  );
  const [playerFilter, setPlayerFilter] = useState<PlayerFilter>("all");
  const [playerSearch, setPlayerSearch] = useState("");
  const [message, setMessage] = useState("");
  const activeDraftId = useRef(draftId);
  const saveActiveMatchDraftRef = useRef(saveActiveMatchDraft);
  const autosaveTimeout = useRef<number | null>(null);
  const autosaveQueue = useRef<Promise<void>>(Promise.resolve());
  const latestDraft = useRef<ActiveMatchDraftInput>({
    groupId,
    format,
    teamAUserIds: compactTeam(teamA),
    teamBUserIds: compactTeam(teamB),
    games: toDraftGames(games),
  });
  const lastQueuedDraft = useRef<string | null>(null);
  const submissionInProgress = useRef(false);
  const completionTimeout = useRef<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [guestPlayers, setGuestPlayers] = useState<AppPlayer[]>([]);
  const [draftGuestIds, setDraftGuestIds] = useState<string[]>([]);
  const submitCommandId = useRef<string | null>(null);
  const selectablePlayers = [...players, ...guestPlayers];
  const activeMemberIds = selectablePlayers.map((player) => player.id);

  const teamASlots = buildTeamSlots(teamA, selectablePlayers, format);
  const teamBSlots = buildTeamSlots(teamB, selectablePlayers, format);
  const teamAUserIds = compactTeam(teamA);
  const teamBUserIds = compactTeam(teamB);
  const selectedPlayerIds = [...teamAUserIds, ...teamBUserIds];
  const canSubmit =
    teamsComplete(format, teamAUserIds, teamBUserIds) &&
    new Set(selectedPlayerIds).size === selectedPlayerIds.length &&
    gamesReadyForSubmission(games) &&
    !isSubmitting;
  const recorderEditable = canEdit && !isSubmitting;
  const currentDraft = useMemo<ActiveMatchDraftInput>(() => ({
    groupId,
    format,
    teamAUserIds: compactTeam(teamA),
    teamBUserIds: compactTeam(teamB),
    games: toDraftGames(games),
  }), [format, games, groupId, teamA, teamB]);

  useLayoutEffect(() => () => {
    setPlayerSelectOpen(false);
    setPlayerFilter("all");
    setPlayerSearch("");
    setMessage("");
  }, []);

  useEffect(() => {
    saveActiveMatchDraftRef.current = saveActiveMatchDraft;
  }, [saveActiveMatchDraft]);

  useEffect(() => {
    activeDraftId.current = draftId;
  }, [draftId]);

  useEffect(() => {
    latestDraft.current = currentDraft;
  }, [currentDraft]);

  useEffect(() => () => {
    if (completionTimeout.current !== null) {
      window.clearTimeout(completionTimeout.current);
      completionTimeout.current = null;
    }
  }, []);

  const enqueueDraftSync = useCallback(async (payload: ActiveMatchDraftInput) => {
    const save = saveActiveMatchDraftRef.current;
    if (!canEdit || !save || submissionInProgress.current) return;
    if (!activeDraftId.current && isEmptyActiveMatchDraft(payload)) return;

    const snapshotKey = JSON.stringify(payload);
    if (lastQueuedDraft.current === snapshotKey) {
      await autosaveQueue.current;
      return;
    }
    lastQueuedDraft.current = snapshotKey;

    autosaveQueue.current = autosaveQueue.current.then(async () => {
      try {
        const priorDraftId = activeDraftId.current;
        const result = await save({ ...payload, draftId: priorDraftId });
        if (result.ok) {
          activeDraftId.current = result.data.draftId ?? undefined;
          if (result.data.draftId !== priorDraftId) {
            replaceDraftIdInUrl(result.data.draftId);
          }
          if (!submissionInProgress.current) {
            setMessage(result.data.outcome === "deleted" ? "Draft deleted." : "Draft saved.");
          }
        } else {
          if (lastQueuedDraft.current === snapshotKey) lastQueuedDraft.current = null;
          if (!submissionInProgress.current) setMessage(result.message);
        }
      } catch (error) {
        if (lastQueuedDraft.current === snapshotKey) lastQueuedDraft.current = null;
        if (!submissionInProgress.current) {
          setMessage(error instanceof Error ? error.message : "Draft could not be saved.");
        }
      }
    });
    await autosaveQueue.current;
  }, [canEdit]);

  useNavigationSyncRegistration(async () => {
    if (autosaveTimeout.current !== null) {
      window.clearTimeout(autosaveTimeout.current);
      autosaveTimeout.current = null;
    }
    await enqueueDraftSync(latestDraft.current);
    await autosaveQueue.current;
  });

  useEffect(() => {
    function syncOnPageHide() {
      if (autosaveTimeout.current !== null) {
        window.clearTimeout(autosaveTimeout.current);
        autosaveTimeout.current = null;
      }
      void enqueueDraftSync(latestDraft.current);
    }

    window.addEventListener("pagehide", syncOnPageHide);
    return () => window.removeEventListener("pagehide", syncOnPageHide);
  }, [enqueueDraftSync]);

  useEffect(() => {
    if (!canEdit || !saveActiveMatchDraftRef.current || submissionInProgress.current) {
      return;
    }

    const payload = currentDraft;
    if (!activeDraftId.current && isEmptyActiveMatchDraft(payload)) return;
    const timeout = window.setTimeout(() => {
      if (autosaveTimeout.current === timeout) {
        autosaveTimeout.current = null;
      }
      if (submissionInProgress.current) {
        return;
      }

      void enqueueDraftSync(payload);
    }, 400);
    autosaveTimeout.current = timeout;

    return () => {
      window.clearTimeout(timeout);
      if (autosaveTimeout.current === timeout) {
        autosaveTimeout.current = null;
      }
    };
  }, [canEdit, currentDraft, enqueueDraftSync, isSubmitting]);

  function updateFormat(value: MatchFormat) {
    setFormat(value);
    setTeamA((ids) => resizeTeamSlots(ids, value));
    setTeamB((ids) => resizeTeamSlots(ids, value));
    setDraftTeamA((ids) => resizeTeamSlots(ids, value));
    setDraftTeamB((ids) => resizeTeamSlots(ids, value));
    setPlayerSelectOpen(false);
    setDraftGuestIds([]);
    setMessage("");
  }

  function removePlayer(team: Team, slotIndex: number) {
    updateTeamSelection(team, (slots) => replaceSlot(slots, slotIndex, null));
    setPlayerSelectOpen(false);
    setMessage("");
  }

  function updateTeamSelection(team: Team, updater: (slots: TeamSelection) => TeamSelection) {
    if (team === "A") {
      setTeamA(updater);
    } else {
      setTeamB(updater);
    }
  }

  function openPlayerSelect(team: Team) {
    if (!canEdit) {
      return;
    }
    setDraftTeamA(resizeTeamSlots(teamA, format));
    setDraftTeamB(resizeTeamSlots(teamB, format));
    setActiveSelectTeam(team);
    setDraftGuestIds([]);
    setPlayerFilter("all");
    setPlayerSearch("");
    setPlayerSelectOpen(true);
    setMessage("");
  }

  function updateDraftTeam(team: Team, selection: TeamSelection) {
    const resizedSelection = resizeTeamSlots(selection, format);

    if (team === "A") {
      setDraftTeamA(resizedSelection);
    } else {
      setDraftTeamB(resizedSelection);
    }
  }

  function addGuestToDraft(name: string) {
    const displayName = normalizeGuestName(name);
    if (!displayName) {
      return;
    }

    const activeSelection = activeSelectTeam === "A" ? draftTeamA : draftTeamB;
    const emptyIndex = activeSelection.findIndex((slot) => !slot);
    if (emptyIndex === -1) {
      return;
    }

    const guest = toGuestPlayer(`guest-${Date.now()}-${draftGuestIds.length}`, displayName);
    setGuestPlayers((current) => [...current, guest]);
    setDraftGuestIds((current) => [...current, guest.id]);
    updateDraftTeam(
      activeSelectTeam,
      activeSelection.map((slot, index) => (index === emptyIndex ? guest.id : slot)),
    );
  }

  function cancelPlayerSelect() {
    setGuestPlayers((current) => current.filter((player) => !draftGuestIds.includes(player.id)));
    setDraftGuestIds([]);
    setPlayerSelectOpen(false);
    setMessage("");
  }

  async function commitPlayerSelect() {
    const selectedIds = [...compactTeam(draftTeamA), ...compactTeam(draftTeamB)];
    const selectedDraftGuestIds = draftGuestIds.filter((id) => selectedIds.includes(id));
    const selectedDraftGuests = selectedDraftGuestIds
      .map((id) => guestPlayers.find((player) => player.id === id))
      .filter((player): player is AppPlayer => Boolean(player));
    let committedTeamA = resizeTeamSlots(draftTeamA, format);
    let committedTeamB = resizeTeamSlots(draftTeamB, format);

    if (selectedDraftGuests.length) {
      const result = createGuestPlayers
        ? await createGuestPlayers({ groupId, names: selectedDraftGuests.map((player) => player.name) })
        : { ok: true as const, data: { players: selectedDraftGuests } };

      if (!result.ok) {
        setPlayerSelectOpen(false);
        setMessage(result.message);
        return;
      }

      const replacements = new Map(
        selectedDraftGuests.map((guest, index) => [guest.id, result.data.players[index]?.id ?? guest.id]),
      );
      committedTeamA = committedTeamA.map((id) => (id ? replacements.get(id) ?? id : id));
      committedTeamB = committedTeamB.map((id) => (id ? replacements.get(id) ?? id : id));
      setGuestPlayers((current) => [
        ...current.filter((player) => !draftGuestIds.includes(player.id)),
        ...result.data.players,
      ]);
    } else {
      setGuestPlayers((current) => current.filter((player) => !draftGuestIds.includes(player.id)));
    }

    setTeamA(committedTeamA);
    setTeamB(committedTeamB);
    setDraftGuestIds([]);
    setPlayerSelectOpen(false);
    setMessage("");
  }

  function setWinner(gameIndex: number, winner: Team) {
    setGames((current) =>
      current.map((game, index) =>
        index === gameIndex ? { ...game, winnerTeam: winner } : game,
      ),
    );
    setMessage("");
  }

  function updateScore(gameIndex: number, team: Team, value: string) {
    const score = normalizeScoreValue(value);

    setGames((current) =>
      current.map((game, index) => {
        if (index !== gameIndex) {
          return game;
        }

        const updated =
          team === "A" ? { ...game, teamAScore: score } : { ...game, teamBScore: score };

        if (
          updated.teamAScore === "" ||
          updated.teamBScore === "" ||
          updated.teamAScore === updated.teamBScore
        ) {
          return updated;
        }

        return {
          ...updated,
          winnerTeam: winnerFromScore({
            teamAScore: updated.teamAScore,
            teamBScore: updated.teamBScore,
          }),
        };
      }),
    );
    setMessage("");
  }

  function addSet() {
    setGames((current) => [...current, newBlankGame()]);
    setMessage("");
  }

  function removeSet(gameIndex: number) {
    setGames((current) =>
      current.length > 1 ? current.filter((_, index) => index !== gameIndex) : current,
    );
    setMessage("");
  }

  function completeSubmission(successMessage: string) {
    setMessage(successMessage);
    completionTimeout.current = window.setTimeout(() => {
      completionTimeout.current = null;
      setFormat(defaultMatchRecording.format);
      setTeamA(normalizeTeamSlots(defaultMatchRecording.teamAUserIds, defaultMatchRecording.format));
      setTeamB(normalizeTeamSlots(defaultMatchRecording.teamBUserIds, defaultMatchRecording.format));
      setGames([newBlankGame()]);
      setPlayerSelectOpen(false);
      setActiveSelectTeam("A");
      setDraftTeamA(resizeTeamSlots(defaultMatchRecording.teamAUserIds, defaultMatchRecording.format));
      setDraftTeamB(resizeTeamSlots(defaultMatchRecording.teamBUserIds, defaultMatchRecording.format));
      setDraftGuestIds([]);
      setPlayerFilter("all");
      setPlayerSearch("");
      setMessage("");
      activeDraftId.current = undefined;
      submitCommandId.current = null;
      submissionInProgress.current = false;
      setIsSubmitting(false);
      if (window.location.search) {
        window.history.replaceState(null, "", `/groups/${groupId}/matches/new`);
      }
    }, 3_000);
  }

  async function submitMatch() {
    if (!canEdit || submissionInProgress.current) {
      return;
    }

    try {
      const completeGames = toCompleteGames(games);
      if (!completeGames) {
        setMessage("Enter both scores for every set.");
        return;
      }

      submitCommandId.current ??= crypto.randomUUID();
      const inputWithoutDraft = {
        groupId,
        commandId: submitCommandId.current,
        format,
        teamAUserIds: compactTeam(teamA),
        teamBUserIds: compactTeam(teamB),
        games: completeGames,
      };
      const validated = validateMatchSubmission(inputWithoutDraft, { activeMemberIds });

      submissionInProgress.current = true;
      setIsSubmitting(true);
      if (autosaveTimeout.current !== null) {
        window.clearTimeout(autosaveTimeout.current);
        autosaveTimeout.current = null;
      }
      await autosaveQueue.current;

      const submittedDraftId = activeDraftId.current;
      const input = { ...inputWithoutDraft, draftId: submittedDraftId };
      if (submittedDraftId) {
        replaceDraftIdInUrl(null);
      }
      if (submitMatchAction) {
        const result = await submitMatchAction(input);
        if (result.ok) {
          completeSubmission("Match saved. Ratings updated immediately. Opponents may review it, and participants have 30 days to correct it.");
        } else {
          if (submittedDraftId) replaceDraftIdInUrl(submittedDraftId);
          submissionInProgress.current = false;
          setIsSubmitting(false);
          setMessage(result.message);
        }
        return;
      }

      completeSubmission(`Submitted. Team ${validated.matchWinnerTeam} wins. Ratings updated immediately; opponents may review it, and participants have 30 days to correct it.`);
    } catch (error) {
      if (activeDraftId.current) replaceDraftIdInUrl(activeDraftId.current);
      submissionInProgress.current = false;
      setIsSubmitting(false);
      setMessage(error instanceof Error ? error.message : "Invalid match.");
    }
  }

  if (playerSelectOpen) {
    return (
      <PlayerSelectView
        players={selectablePlayers}
        groups={groupOptions}
        currentGroupId={groupId}
        format={format}
        draftTeamA={draftTeamA}
        draftTeamB={draftTeamB}
        activeTeam={activeSelectTeam}
        filter={playerFilter}
        search={playerSearch}
        onDraftTeamChange={updateDraftTeam}
        onActiveTeamChange={setActiveSelectTeam}
        onFilterChange={setPlayerFilter}
        onSearchChange={setPlayerSearch}
        onAddGuest={addGuestToDraft}
        onCancel={cancelPlayerSelect}
        onCommit={commitPlayerSelect}
      />
    );
  }

  return (
    <section className={styles.screen}>
      <div className={styles.header}>
        <h1 className={styles.title}>Match Recording</h1>
        <GroupSwitcher groups={groupOptions} currentGroupId={groupId} disabled={!recorderEditable} />
      </div>

      <FormatToggle value={format} onChange={updateFormat} disabled={!recorderEditable} />

      <div className={styles.teams}>
        <TeamSummaryCard
          label="Team A"
          slots={teamASlots}
          onOpenPicker={() => openPlayerSelect("A")}
          onRemove={(slotIndex) => removePlayer("A", slotIndex)}
          editable={recorderEditable}
        />
        <TeamSummaryCard
          label="Team B"
          slots={teamBSlots}
          onOpenPicker={() => openPlayerSelect("B")}
          onRemove={(slotIndex) => removePlayer("B", slotIndex)}
          editable={recorderEditable}
        />
      </div>

      <div className={styles.setList}>
        {games.map((game, index) => (
          <SetScoreRow
            key={index}
            game={game}
            index={index}
            onWinnerChange={(winner) => setWinner(index, winner)}
            onScoreChange={(team, value) => updateScore(index, team, value)}
            onRemove={recorderEditable && games.length > 1 ? () => removeSet(index) : undefined}
            editable={recorderEditable}
          />
        ))}
        {recorderEditable ? (
          <button
            type="button"
            onClick={addSet}
            className={styles.addSetButton}
          >
            <Plus className={styles.smallIcon} />
            Add set
          </button>
        ) : null}
      </div>

      <div className={styles.footer}>
        {message ? (
          <p className={styles.message}>
            {message}
          </p>
        ) : null}
        {canEdit ? (
          <Button type="button" onClick={submitMatch} disabled={!canSubmit} className={styles.submitButton}>
            Submit
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function normalizeTeamSlots(userIds: string[], format: MatchFormat): TeamSelection {
  return resizeTeamSlots(userIds, format);
}

function resizeTeamSlots(userIds: Array<string | null>, format: MatchFormat): TeamSelection {
  const size = format === "singles" ? 1 : 2;
  const slots = userIds.slice(0, size);

  while (slots.length < size) {
    slots.push(null);
  }

  return slots;
}

function replaceSlot(slots: TeamSelection, slotIndex: number, playerId: string | null) {
  return slots.map((slot, index) => (index === slotIndex ? playerId : slot));
}

function compactTeam(team: Array<string | null>): string[] {
  return team.filter((playerId): playerId is string => Boolean(playerId));
}

function teamsComplete(format: MatchFormat, teamAUserIds: string[], teamBUserIds: string[]) {
  const size = format === "singles" ? 1 : 2;
  return teamAUserIds.length === size && teamBUserIds.length === size;
}

function winnerFromScore(game: Score): Team {
  return game.teamAScore >= game.teamBScore ? "A" : "B";
}

function winnerFromDraftGame(game: {
  teamAScore: number | null;
  teamBScore: number | null;
}): Team {
  if (game.teamAScore === null || game.teamBScore === null) return "A";
  return game.teamAScore >= game.teamBScore ? "A" : "B";
}

function newBlankGame(): RecordedGame {
  return { teamAScore: "", teamBScore: "", winnerTeam: "A" };
}

function toCompleteGames(games: RecordedGame[]): MatchGameInput[] | null {
  const completeGames: MatchGameInput[] = [];

  for (const game of games) {
    if (game.teamAScore === "" || game.teamBScore === "") {
      return null;
    }

    completeGames.push({
      teamAScore: game.teamAScore,
      teamBScore: game.teamBScore,
      winnerTeam: game.winnerTeam,
    });
  }

  return completeGames;
}

function toDraftGames(games: RecordedGame[]): ActiveMatchDraftGameInput[] {
  return games.map((game) => ({
    teamAScore: game.teamAScore === "" ? null : game.teamAScore,
    teamBScore: game.teamBScore === "" ? null : game.teamBScore,
    winnerTeam: game.winnerTeam,
  }));
}

function replaceDraftIdInUrl(draftId: string | null) {
  const url = new URL(window.location.href);
  if (draftId) {
    url.searchParams.set("draftId", draftId);
  } else {
    url.searchParams.delete("draftId");
  }
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function gamesReadyForSubmission(games: RecordedGame[]) {
  return (
    games.length > 0 &&
    games.every(
      (game) =>
        game.teamAScore !== "" &&
        game.teamBScore !== "" &&
        game.teamAScore !== game.teamBScore,
    )
  );
}

function normalizeScoreValue(value: string): EditableScore {
  if (value === "") {
    return "";
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.min(99, Math.trunc(parsed)));
}

function FormatToggle({
  value,
  onChange,
  disabled = false,
}: {
  value: MatchFormat;
  onChange: (value: MatchFormat) => void;
  disabled?: boolean;
}) {
  return (
    <div className={styles.formatToggle}>
      {(["doubles", "singles"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          disabled={disabled}
          aria-pressed={value === option}
          className={clsx(styles.formatOption, value === option && styles.formatOptionActive)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function TeamSummaryCard({
  label,
  slots,
  onOpenPicker,
  onRemove,
  editable,
}: {
  label: string;
  slots: TeamSlot[];
  onOpenPicker: (slotIndex: number) => void;
  onRemove: (slotIndex: number) => void;
  editable: boolean;
}) {
  return (
    <div className={styles.teamSummary}>
      <h2 className={styles.teamLabel}>{label}</h2>
      <div className={styles.teamCard}>
        {slots.map((slot, index) =>
          slot.empty ? (
            editable ? (
              <button
                key={`empty-${index}`}
                type="button"
                onClick={() => onOpenPicker(index)}
                className={styles.emptySlotButton}
                aria-label={`${label} empty player slot ${index + 1}`}
                aria-haspopup="dialog"
              >
                <span className={styles.emptyAvatarInteractive}>
                  <Plus className={styles.mediumIcon} />
                </span>
                <span className={styles.emptyLabel}>Empty</span>
              </button>
            ) : (
              <div key={`empty-${index}`} className={styles.emptySlot} aria-label={`${label} empty player slot ${index + 1}`}>
                <span className={styles.emptyAvatar}>
                  <Plus className={styles.mediumIcon} />
                </span>
                <span className={styles.emptyLabel}>Empty</span>
              </div>
            )
          ) : (
            <div key={`${slot.id}-${index}`} className={styles.playerSlot}>
              <span className={styles.playerAvatar}>
                {slot.initials}
              </span>
              {editable ? (
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  aria-label={`Remove ${slot.name} from ${label}`}
                  className={styles.removePlayerButton}
                >
                  <X className={styles.removePlayerIcon} />
                </button>
              ) : null}
              <span className={styles.playerName}>{slot.name}</span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function SetScoreRow({
  game,
  index,
  onWinnerChange,
  onScoreChange,
  onRemove,
  editable,
}: {
  game: RecordedGame;
  index: number;
  onWinnerChange: (winner: Team) => void;
  onScoreChange: (team: Team, value: string) => void;
  onRemove?: () => void;
  editable: boolean;
}) {
  const winner = game.winnerTeam;

  return (
    <div className={styles.setRow}>
      <div className={styles.setHeader}>
        <h3 className={styles.setTitle}>Set {index + 1}</h3>
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove Set ${index + 1}`}
            className={styles.removeSetButton}
          >
            <Trash2 className={styles.smallIcon} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className={styles.scoreGrid}>
        <ScoreTile
          setNumber={index + 1}
          team="A"
          score={game.teamAScore}
          selected={winner === "A"}
          onWinnerClick={() => onWinnerChange("A")}
          onScoreChange={(value) => onScoreChange("A", value)}
          editable={editable}
        />
        <ScoreTile
          setNumber={index + 1}
          team="B"
          score={game.teamBScore}
          selected={winner === "B"}
          onWinnerClick={() => onWinnerChange("B")}
          onScoreChange={(value) => onScoreChange("B", value)}
          editable={editable}
        />
      </div>
    </div>
  );
}

function ScoreTile({
  setNumber,
  team,
  score,
  selected,
  onWinnerClick,
  onScoreChange,
  editable,
}: {
  setNumber: number;
  team: Team;
  score: EditableScore;
  selected: boolean;
  onWinnerClick: () => void;
  onScoreChange: (value: string) => void;
  editable: boolean;
}) {
  return (
    <div
      aria-label={`Set ${setNumber} Team ${team} ${score === "" ? "not entered" : score} ${selected ? "Win" : "Loss"}`}
      className={clsx(styles.scoreTile, selected ? styles.scoreTileSelected : styles.scoreTileNeutral)}
    >
      {selected ? <Medal className={styles.medal} aria-hidden="true" /> : null}
      <button
        type="button"
        onClick={onWinnerClick}
        disabled={!editable}
        aria-pressed={selected}
        aria-label={`Mark Set ${setNumber} Team ${team} as winner`}
        className={styles.winnerButton}
      />
      <div
        className={clsx(styles.scorePanel, selected ? styles.scorePanelSelected : styles.scorePanelNeutral)}
      >
        <input
          aria-label={`Set ${setNumber} Team ${team} score`}
          type="number"
          min={0}
          max={99}
          inputMode="numeric"
          value={score}
          placeholder="-"
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onScoreChange(event.target.value)}
          disabled={!editable}
          className={styles.scoreInput}
        />
        <span
          aria-hidden="true"
          className={clsx(styles.scoreResult, selected && styles.scoreResultSelected)}
        >
          {selected ? "Win" : "Loss"}
        </span>
      </div>
    </div>
  );
}

function normalizeGuestName(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).join(" ");
}

function toGuestPlayer(id: string, name: string): AppPlayer {
  return {
    id,
    name,
    initials: initialsFor(name),
    role: "Guest",
    rating: 1500,
    rd: 350,
    rank: 0,
    gamesPlayed: 0,
    status: "Active",
    isGuest: true,
  };
}

function initialsFor(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function buildTeamSlots(
  userIds: TeamSelection,
  players: AppPlayer[],
  format: MatchFormat,
): TeamSlot[] {
  const maxSlots = format === "singles" ? 1 : 2;
  const slots = resizeTeamSlots(userIds, format).slice(0, maxSlots);

  return slots.map((userId) => {
    if (!userId) {
      return { empty: true };
    }

    const player = players.find((candidate) => candidate.id === userId);
    const fullName = player?.name ?? "Unknown player";

    return {
      id: userId,
      initials: player?.initials ?? "?",
      name: player ? fullName.split(" ")[0] : "Unknown",
      fullName,
    };
  });
}
