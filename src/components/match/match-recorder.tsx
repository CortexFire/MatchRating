"use client";

import { useState } from "react";
import { ChevronDown, Medal, Plus, X } from "lucide-react";
import { type ActionResult } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  PlayerSelectView,
  type PlayerFilter,
  type PlayerSelection,
} from "@/components/match/player-select-view";
import { validateMatchSubmission, type MatchFormat, type Team } from "@/lib/matches/validation";
import { type AppPlayer } from "@/lib/app-data";
import { cn } from "@/lib/utils";

type Score = { teamAScore: number; teamBScore: number };
type RecordedGame = Score & { winnerTeam: Team };
type TeamSelection = PlayerSelection;
type CreateGuestPlayers = (input: { groupId: string; names: string[] }) => Promise<ActionResult<{ players: AppPlayer[] }>>;
type TeamSlot =
  | { id: string; initials: string; name: string; fullName: string; empty?: false }
  | { empty: true };

const WIN_SCORE = 21;
const LOSS_SCORE = 18;
const defaultMatchRecording = {
  format: "doubles",
  teamAUserIds: [],
  teamBUserIds: [],
  games: [{ teamAScore: WIN_SCORE, teamBScore: LOSS_SCORE }],
} satisfies InitialMatchRecording;

export type InitialMatchRecording = {
  format: MatchFormat;
  teamAUserIds: string[];
  teamBUserIds: string[];
  games: Score[];
};

export function MatchRecorder({
  groupId = "test-group",
  groupName = "Downtown Rec",
  players,
  initialMatch = defaultMatchRecording,
  createGuestPlayers,
}: {
  groupId?: string;
  groupName?: string;
  players: AppPlayer[];
  initialMatch?: InitialMatchRecording;
  createGuestPlayers?: CreateGuestPlayers;
}) {
  const [format, setFormat] = useState<MatchFormat>(initialMatch.format);
  const [teamA, setTeamA] = useState<TeamSelection>(() =>
    normalizeTeamSlots(initialMatch.teamAUserIds, initialMatch.format),
  );
  const [teamB, setTeamB] = useState<TeamSelection>(() =>
    normalizeTeamSlots(initialMatch.teamBUserIds, initialMatch.format),
  );
  const [games, setGames] = useState<RecordedGame[]>(() =>
    initialMatch.games.map((game) => ({ ...game, winnerTeam: winnerFromScore(game) })),
  );
  const [playerSelectOpen, setPlayerSelectOpen] = useState(false);
  const [activeSelectTeam, setActiveSelectTeam] = useState<Team>("A");
  const [draftTeamA, setDraftTeamA] = useState<TeamSelection>(() =>
    resizeTeamSlots(initialMatch.teamAUserIds, initialMatch.format),
  );
  const [draftTeamB, setDraftTeamB] = useState<TeamSelection>(() =>
    resizeTeamSlots(initialMatch.teamBUserIds, initialMatch.format),
  );
  const [playerFilter, setPlayerFilter] = useState<PlayerFilter>("all");
  const [playerSearch, setPlayerSearch] = useState("");
  const [message, setMessage] = useState("");
  const [guestPlayers, setGuestPlayers] = useState<AppPlayer[]>([]);
  const [draftGuestIds, setDraftGuestIds] = useState<string[]>([]);
  const selectablePlayers = [...players, ...guestPlayers];
  const activeMemberIds = selectablePlayers.map((player) => player.id);

  const teamASlots = buildTeamSlots(teamA, selectablePlayers, format);
  const teamBSlots = buildTeamSlots(teamB, selectablePlayers, format);

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

        return updated.teamAScore === updated.teamBScore
          ? updated
          : { ...updated, winnerTeam: winnerFromScore(updated) };
      }),
    );
    setMessage("");
  }

  function addSet() {
    setGames((current) => [
      ...current,
      { teamAScore: WIN_SCORE, teamBScore: LOSS_SCORE, winnerTeam: "A" },
    ]);
    setMessage("");
  }

  function submitMatch() {
    try {
      const validated = validateMatchSubmission(
        {
          groupId,
          format,
          teamAUserIds: compactTeam(teamA),
          teamBUserIds: compactTeam(teamB),
          games: games.map(({ teamAScore, teamBScore }) => ({ teamAScore, teamBScore })),
        },
        { activeMemberIds },
      );
      setMessage(`Submitted. Team ${validated.matchWinnerTeam} wins; ratings update immediately.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invalid match.");
    }
  }

  if (playerSelectOpen) {
    return (
      <PlayerSelectView
        players={selectablePlayers}
        groupName={groupName}
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
    <section className="flex min-h-full flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[22px] font-bold leading-7 text-ink">Match Recording</h1>
        <div
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-victory px-4 text-sm font-bold text-ink"
          aria-label={`Current group ${groupName}`}
        >
          {groupName}
          <ChevronDown className="size-4 stroke-[3]" />
        </div>
      </div>

      <FormatToggle value={format} onChange={updateFormat} />

      <div className="grid grid-cols-2 gap-6 px-3">
        <TeamSummaryCard
          label="Team A"
          slots={teamASlots}
          onOpenPicker={() => openPlayerSelect("A")}
          onRemove={(slotIndex) => removePlayer("A", slotIndex)}
        />
        <TeamSummaryCard
          label="Team B"
          slots={teamBSlots}
          onOpenPicker={() => openPlayerSelect("B")}
          onRemove={(slotIndex) => removePlayer("B", slotIndex)}
        />
      </div>

      <div className="flex flex-col gap-3">
        {games.map((game, index) => (
          <SetScoreRow
            key={index}
            game={game}
            index={index}
            onWinnerChange={(winner) => setWinner(index, winner)}
            onScoreChange={(team, value) => updateScore(index, team, value)}
          />
        ))}
        <button
          type="button"
          onClick={addSet}
          className="flex min-h-11 w-full items-center justify-center gap-1 rounded-lg border border-stroke bg-surface text-sm font-bold text-ink transition hover:bg-app-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          <Plus className="size-4" />
          Add set
        </button>
      </div>

      <div className="mt-auto flex flex-col gap-3 pt-2">
        {message ? (
          <p className="rounded-lg border border-victory-stroke bg-victory p-3 text-sm font-semibold text-ink">
            {message}
          </p>
        ) : null}
        <Button type="button" onClick={submitMatch} className="w-full">
          Submit
        </Button>
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

function winnerFromScore(game: Score): Team {
  return game.teamAScore >= game.teamBScore ? "A" : "B";
}

function normalizeScoreValue(value: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.min(99, Math.trunc(parsed)));
}

function FormatToggle({
  value,
  onChange,
}: {
  value: MatchFormat;
  onChange: (value: MatchFormat) => void;
}) {
  return (
    <div className="grid min-h-11 grid-cols-2 rounded-lg border border-stroke bg-surface p-1">
      {(["doubles", "singles"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className={cn(
            "rounded-md text-sm font-semibold capitalize text-muted transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action",
            value === option && "bg-selection text-ink",
          )}
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
}: {
  label: string;
  slots: TeamSlot[];
  onOpenPicker: (slotIndex: number) => void;
  onRemove: (slotIndex: number) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <h2 className="text-sm font-bold text-muted">{label}</h2>
      <div className="relative flex min-h-[74px] min-w-[116px] items-start justify-center gap-2 rounded-lg border border-stroke bg-surface px-2 py-2">
        {slots.map((slot, index) =>
          slot.empty ? (
            <button
              key={`empty-${index}`}
              type="button"
              onClick={() => onOpenPicker(index)}
              className="flex min-w-11 flex-col items-center gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
              aria-label={`${label} empty player slot ${index + 1}`}
              aria-haspopup="dialog"
            >
              <span className="flex size-11 items-center justify-center rounded-full border border-stroke bg-app-bg text-muted transition hover:text-ink">
                <Plus className="size-5" />
              </span>
              <span className="text-[11px] text-transparent">Empty</span>
            </button>
          ) : (
            <div key={`${slot.id}-${index}`} className="relative flex min-w-0 flex-col items-center gap-1">
              <span className="flex size-11 items-center justify-center rounded-full bg-victory text-sm font-bold text-ink">
                {slot.initials}
              </span>
              <button
                type="button"
                onClick={() => onRemove(index)}
                aria-label={`Remove ${slot.name} from ${label}`}
                className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full border border-stroke bg-surface text-muted shadow-sm transition hover:bg-app-bg hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
              >
                <X className="size-3" />
              </button>
              <span className="max-w-12 truncate text-[11px] text-muted">{slot.name}</span>
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
}: {
  game: RecordedGame;
  index: number;
  onWinnerChange: (winner: Team) => void;
  onScoreChange: (team: Team, value: string) => void;
}) {
  const winner = game.winnerTeam;

  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-bold text-muted">Set {index + 1}</h3>
      <div className="grid grid-cols-2 gap-4">
        <ScoreTile
          setNumber={index + 1}
          team="A"
          score={game.teamAScore}
          selected={winner === "A"}
          onWinnerClick={() => onWinnerChange("A")}
          onScoreChange={(value) => onScoreChange("A", value)}
        />
        <ScoreTile
          setNumber={index + 1}
          team="B"
          score={game.teamBScore}
          selected={winner === "B"}
          onWinnerClick={() => onWinnerChange("B")}
          onScoreChange={(value) => onScoreChange("B", value)}
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
}: {
  setNumber: number;
  team: Team;
  score: number;
  selected: boolean;
  onWinnerClick: () => void;
  onScoreChange: (value: string) => void;
}) {
  return (
    <div
      aria-label={`Set ${setNumber} Team ${team} ${score} ${selected ? "Win" : "Loss"}`}
      className={cn(
        "relative flex h-[86px] items-center justify-center rounded-lg border transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-action",
        selected ? "border-victory-stroke bg-victory" : "border-stroke bg-surface",
      )}
    >
      {selected ? <Medal className="absolute left-2 top-2 size-4 text-ink" aria-hidden="true" /> : null}
      <div
        className={cn(
          "relative grid h-[70px] w-[92px] grid-rows-[1fr_auto] items-center rounded-md border bg-surface px-2 pb-2 pt-1",
          selected ? "border-victory-stroke" : "border-stroke",
        )}
      >
        <button
          type="button"
          onClick={onWinnerClick}
          aria-pressed={selected}
          aria-label={`Mark Set ${setNumber} Team ${team} as winner`}
          className="absolute inset-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        />
        <input
          aria-label={`Set ${setNumber} Team ${team} score`}
          type="number"
          min={0}
          max={99}
          inputMode="numeric"
          value={score}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onScoreChange(event.target.value)}
          className="relative z-10 h-11 w-full self-center rounded-md border border-transparent bg-transparent p-0 text-center text-[32pt] font-bold leading-none text-ink [appearance:textfield] focus:border-selection-stroke focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span
          aria-hidden="true"
          className={cn(
            "relative z-0 pointer-events-none text-center text-xs font-semibold leading-3 text-muted",
            selected && "text-ink",
          )}
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
    role: "Member",
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
