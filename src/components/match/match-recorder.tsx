"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Medal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { validateMatchSubmission, type MatchFormat, type Team } from "@/lib/matches/validation";
import { type DemoPlayer } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

type Score = { teamAScore: number; teamBScore: number };
type TeamSlot = { initials: string; name: string; empty?: false } | { empty: true };

const WIN_SCORE = 21;
const LOSS_SCORE = 18;
const defaultMatchRecording = {
  format: "doubles",
  teamAUserIds: ["alice", "cory"],
  teamBUserIds: ["bea"],
  games: [
    { teamAScore: WIN_SCORE, teamBScore: LOSS_SCORE },
    { teamAScore: WIN_SCORE, teamBScore: LOSS_SCORE },
  ],
} satisfies InitialMatchRecording;

export type InitialMatchRecording = {
  format: MatchFormat;
  teamAUserIds: string[];
  teamBUserIds: string[];
  games: Score[];
};

export function MatchRecorder({
  players,
  initialMatch = defaultMatchRecording,
}: {
  players: DemoPlayer[];
  initialMatch?: InitialMatchRecording;
}) {
  const [format, setFormat] = useState<MatchFormat>(initialMatch.format);
  const [teamA, setTeamA] = useState<string[]>(initialMatch.teamAUserIds);
  const [teamB, setTeamB] = useState<string[]>(initialMatch.teamBUserIds);
  const [games, setGames] = useState<Score[]>(initialMatch.games);
  const [message, setMessage] = useState("");
  const activeMemberIds = useMemo(() => players.map((player) => player.id), [players]);

  const teamASlots = buildTeamSlots(teamA, players, format);
  const teamBSlots = buildTeamSlots(teamB, players, format);

  function updateFormat(value: MatchFormat) {
    setFormat(value);
    setTeamA((ids) => ids.slice(0, value === "singles" ? 1 : 2));
    setTeamB((ids) => ids.slice(0, value === "singles" ? 1 : 2));
    setMessage("");
  }

  function setWinner(gameIndex: number, winner: Team) {
    setGames((current) =>
      current.map((game, index) => {
        if (index !== gameIndex) {
          return game;
        }

        return winner === "A"
          ? { teamAScore: WIN_SCORE, teamBScore: LOSS_SCORE }
          : { teamAScore: LOSS_SCORE, teamBScore: WIN_SCORE };
      }),
    );
    setMessage("");
  }

  function addSet() {
    setGames((current) => [...current, { teamAScore: WIN_SCORE, teamBScore: LOSS_SCORE }]);
    setMessage("");
  }

  function submitMatch() {
    try {
      const normalizedTeamA = completeTeam(teamA, teamB, activeMemberIds, format);
      const normalizedTeamB = completeTeam(teamB, normalizedTeamA, activeMemberIds, format);
      const validated = validateMatchSubmission(
        {
          groupId: "demo",
          format,
          teamAUserIds: normalizedTeamA,
          teamBUserIds: normalizedTeamB,
          games,
        },
        { activeMemberIds },
      );
      setMessage(`Submitted. Team ${validated.matchWinnerTeam} wins; ratings update immediately.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invalid match.");
    }
  }

  return (
    <section className="flex min-h-full flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[22px] font-bold leading-7 text-ink">Match Recording</h1>
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-stroke bg-surface px-3 text-xs font-bold text-ink"
          aria-label="Current group Downtown Rec"
        >
          Downtown Rec
          <ChevronDown className="size-3.5" />
        </button>
      </div>

      <FormatToggle value={format} onChange={updateFormat} />

      <div className="grid grid-cols-2 gap-6 px-3">
        <TeamSummaryCard label="Team A" slots={teamASlots} />
        <TeamSummaryCard label="Team B" slots={teamBSlots} />
      </div>

      <div className="flex flex-col gap-3">
        {games.map((game, index) => (
          <SetScoreRow
            key={index}
            game={game}
            index={index}
            onWinnerChange={(winner) => setWinner(index, winner)}
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

function completeTeam(
  selectedIds: string[],
  opposingIds: string[],
  activeMemberIds: string[],
  format: MatchFormat,
) {
  const size = format === "singles" ? 1 : 2;
  const completed = selectedIds.slice(0, size);

  for (const memberId of activeMemberIds) {
    if (completed.length >= size) {
      break;
    }

    if (!completed.includes(memberId) && !opposingIds.includes(memberId)) {
      completed.push(memberId);
    }
  }

  return completed;
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
          className={cn(
            "rounded-md text-sm font-semibold capitalize text-muted transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action",
            value === option && "border border-selection-stroke bg-selection text-ink",
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
}: {
  label: string;
  slots: TeamSlot[];
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <h2 className="text-sm font-bold text-muted">{label}</h2>
      <div className="flex min-h-[74px] min-w-[116px] items-start justify-center gap-2 rounded-lg border border-stroke bg-surface px-2 py-2">
        {slots.map((slot, index) =>
          slot.empty ? (
            <button
              key={`empty-${index}`}
              type="button"
              className="flex min-w-11 flex-col items-center gap-1"
              aria-label={`${label} empty player slot`}
            >
              <span className="flex size-11 items-center justify-center rounded-full border border-stroke bg-app-bg text-ink">
                <Plus className="size-5" />
              </span>
              <span className="text-[11px] text-transparent">Empty</span>
            </button>
          ) : (
            <div key={`${slot.name}-${index}`} className="flex min-w-0 flex-col items-center gap-1">
              <span className="flex size-11 items-center justify-center rounded-full bg-victory text-sm font-bold text-ink">
                {slot.initials}
              </span>
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
}: {
  game: Score;
  index: number;
  onWinnerChange: (winner: Team) => void;
}) {
  const winner = game.teamAScore > game.teamBScore ? "A" : "B";

  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-bold text-muted">Set {index + 1}</h3>
      <div className="grid grid-cols-2 gap-4">
        <ScoreTile
          setNumber={index + 1}
          team="A"
          score={game.teamAScore}
          selected={winner === "A"}
          onClick={() => onWinnerChange("A")}
        />
        <ScoreTile
          setNumber={index + 1}
          team="B"
          score={game.teamBScore}
          selected={winner === "B"}
          onClick={() => onWinnerChange("B")}
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
  onClick,
}: {
  setNumber: number;
  team: Team;
  score: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`Set ${setNumber} Team ${team} ${score} ${selected ? "Win" : "Loss"}`}
      className={cn(
        "relative flex h-[74px] items-center justify-center rounded-lg border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action",
        selected ? "border-victory-stroke bg-victory" : "border-stroke bg-surface",
      )}
    >
      {selected ? (
        <Medal className="absolute left-2 top-2 size-4 text-ink" aria-hidden="true" />
      ) : null}
      <span className="flex h-[58px] w-[92px] flex-col items-center justify-center rounded-md border border-stroke bg-surface">
        <span className="text-[32px] font-bold leading-8 text-ink">{score}</span>
        <span className="mt-1 text-xs text-muted">{selected ? "Win" : "Loss"}</span>
      </span>
    </button>
  );
}

function buildTeamSlots(userIds: string[], players: DemoPlayer[], format: MatchFormat): TeamSlot[] {
  const maxSlots = format === "singles" ? 1 : 2;
  const slots: TeamSlot[] = userIds.slice(0, maxSlots).map((userId) => {
    const player = players.find((candidate) => candidate.id === userId);
    return {
      initials: player?.initials ?? "MC",
      name: player?.name.split(" ")[0] ?? "Maya",
    };
  });

  while (slots.length < maxSlots) {
    slots.push({ empty: true });
  }

  return slots;
}
