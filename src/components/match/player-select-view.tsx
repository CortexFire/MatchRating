"use client";

import { ChevronDown, Search, UserPlus } from "lucide-react";
import { AvatarInitials } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type AppPlayer } from "@/lib/app-data";
import { type MatchFormat, type Team } from "@/lib/matches/validation";
import { cn } from "@/lib/utils";

export type PlayerFilter = "selected" | "all" | "active" | "inactive";
export type PlayerSelection = Array<string | null>;

type PlayerSelectViewProps = {
  players: AppPlayer[];
  groupName: string;
  format: MatchFormat;
  draftTeamA: PlayerSelection;
  draftTeamB: PlayerSelection;
  activeTeam: Team;
  filter: PlayerFilter;
  search: string;
  onDraftTeamChange: (team: Team, selection: PlayerSelection) => void;
  onActiveTeamChange: (team: Team) => void;
  onFilterChange: (filter: PlayerFilter) => void;
  onSearchChange: (search: string) => void;
  onAddGuest: (name: string) => void;
  onCancel: () => void;
  onCommit: () => void;
};

const filters: Array<{ value: PlayerFilter; label: string }> = [
  { value: "selected", label: "Selected" },
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export function PlayerSelectView({
  players,
  groupName,
  format,
  draftTeamA,
  draftTeamB,
  activeTeam,
  filter,
  search,
  onDraftTeamChange,
  onActiveTeamChange,
  onFilterChange,
  onSearchChange,
  onAddGuest,
  onCancel,
  onCommit,
}: PlayerSelectViewProps) {
  const requiredCount = getRequiredCount(format);
  const teamA = normalizeSelection(draftTeamA, requiredCount);
  const teamB = normalizeSelection(draftTeamB, requiredCount);
  const activeSelection = activeTeam === "A" ? teamA : teamB;
  const selectedPlayerIds = [...compactSelection(teamA), ...compactSelection(teamB)];
  const selectedIds = new Set(selectedPlayerIds);
  const activeIds = new Set(compactSelection(activeSelection));
  const activeTeamFull = activeSelection.every(Boolean);
  const guestName = search.trim();
  const canAddGuest = guestName.length > 0 && !activeTeamFull;
  const guestAddLabel = canAddGuest ? `Add guest player ${guestName}` : "Add player";
  const canCommit =
    teamA.every(Boolean) && teamB.every(Boolean) && selectedIds.size === selectedPlayerIds.length;
  const searchTerm = guestName.toLowerCase();

  const visiblePlayers = players.filter((player) => {
    const selected = selectedIds.has(player.id);
    const active = player.status === "Active";
    const matchesFilter =
      filter === "all" ||
      (filter === "selected" && selected) ||
      (filter === "active" && active) ||
      (filter === "inactive" && !active);
    const searchableText = `${player.name} ${player.initials}`.toLowerCase();
    const matchesSearch = searchTerm.length === 0 || searchableText.includes(searchTerm);

    return matchesFilter && matchesSearch;
  });

  function removeFromActiveTeam(playerId: string) {
    onDraftTeamChange(
      activeTeam,
      activeSelection.map((slot) => (slot === playerId ? null : slot)),
    );
  }

  function addToActiveTeam(playerId: string) {
    const emptyIndex = activeSelection.findIndex((slot) => !slot);

    if (emptyIndex === -1) {
      return;
    }

    onDraftTeamChange(
      activeTeam,
      activeSelection.map((slot, index) => (index === emptyIndex ? playerId : slot)),
    );
  }

  function selectPlayer(playerId: string) {
    if (activeIds.has(playerId)) {
      removeFromActiveTeam(playerId);
      return;
    }

    if (!selectedIds.has(playerId) && !activeTeamFull) {
      addToActiveTeam(playerId);
    }
  }

  return (
    <section className="flex min-h-full flex-col gap-4 bg-app-bg text-ink">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[22px] font-bold leading-7 text-ink">Player Select</h1>
        <div
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-victory px-4 text-sm font-bold text-ink"
          aria-label={`Current group ${groupName}`}
        >
          {groupName}
          <ChevronDown aria-hidden="true" className="size-4 stroke-[3]" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TeamPreview
          label="Team A"
          active={activeTeam === "A"}
          selection={teamA}
          players={players}
          onSelect={() => onActiveTeamChange("A")}
        />
        <TeamPreview
          label="Team B"
          active={activeTeam === "B"}
          selection={teamB}
          players={players}
          onSelect={() => onActiveTeamChange("B")}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-lg border border-stroke bg-surface p-3">
        <div className="grid min-h-11 grid-cols-4 rounded-lg border border-stroke bg-surface p-1">
          {filters.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              aria-label={`Filter ${option.label}`}
              onClick={() => onFilterChange(option.value)}
              className={cn(
                "rounded-md px-1 text-xs font-bold text-muted transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action",
                filter === option.value && "bg-selection text-ink",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search for a player</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            />
            <Input
              type="search"
              value={search}
              placeholder="Search for a player"
              onChange={(event) => onSearchChange(event.target.value)}
              className="pl-9"
            />
          </label>
          <button
            type="button"
            disabled={!canAddGuest}
            aria-label={guestAddLabel}
            onClick={() => onAddGuest(guestName)}
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-lg border border-stroke bg-surface text-muted transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action",
              canAddGuest ? "hover:bg-app-bg hover:text-ink" : "opacity-60",
            )}
          >
            <UserPlus aria-hidden="true" className="size-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto pb-1">
          {visiblePlayers.map((player) => {
            const selected = selectedIds.has(player.id);
            const selectedInActiveTeam = activeIds.has(player.id);
            const selectedInOtherTeam = selected && !selectedInActiveTeam;
            const inactive = player.status !== "Active";
            const disabled = selectedInOtherTeam || (!selected && activeTeamFull);
            const assignedTeam = teamA.includes(player.id) ? "A" : "B";
            const actionLabel = selectedInOtherTeam
              ? `Already assigned to Team ${assignedTeam}: ${player.name}`
              : selectedInActiveTeam
                ? `Remove ${player.name} from draft Team ${activeTeam}`
                : `Select ${player.name}`;

            return (
              <PlayerRow
                key={player.id}
                player={player}
                selected={selected}
                inactive={inactive}
                disabled={disabled}
                actionLabel={actionLabel}
                onSelect={() => selectPlayer(player.id)}
              />
            );
          })}
          {visiblePlayers.length === 0 ? (
            <p className="rounded-lg border border-stroke bg-surface px-3 py-4 text-center text-sm font-semibold text-muted">
              No players found.
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-1">
        <Button type="button" disabled={!canCommit} onClick={onCommit} className="w-full">
          Add players
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} className="w-full">
          Cancel
        </Button>
      </div>
    </section>
  );
}

function TeamPreview({
  label,
  active,
  selection,
  players,
  onSelect,
}: {
  label: "Team A" | "Team B";
  active: boolean;
  selection: PlayerSelection;
  players: AppPlayer[];
  onSelect: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-bold text-muted">{label}</span>
      <button
        type="button"
        aria-label={`Select ${label}: ${describeSelection(selection, players)}`}
        aria-pressed={active}
        onClick={onSelect}
        className={cn(
          "flex min-h-[132px] flex-col gap-2 rounded-lg border p-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action",
          active ? "border-selection-stroke bg-selection" : "border-stroke bg-surface hover:bg-app-bg",
        )}
      >
        {selection.map((playerId, index) => {
          const player = players.find((candidate) => candidate.id === playerId);

          return (
            <span
              key={`${label}-${index}`}
              aria-label={player ? `Draft ${label} player ${player.name}` : undefined}
              className="flex min-h-11 items-center gap-2 rounded-lg border border-stroke bg-surface px-2"
            >
              <AvatarInitials
                initials={player?.initials ?? `${index + 1}`}
                className={cn("size-9", !player && "border border-stroke bg-app-bg text-muted")}
              />
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
                {player ? shortenName(player.name) : "Empty"}
              </span>
            </span>
          );
        })}
      </button>
    </div>
  );
}

function PlayerRow({
  player,
  selected,
  inactive,
  disabled,
  actionLabel,
  onSelect,
}: {
  player: AppPlayer;
  selected: boolean;
  inactive: boolean;
  disabled: boolean;
  actionLabel: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={actionLabel}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex min-h-[72px] w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action disabled:cursor-not-allowed",
        selected ? "border-selection-stroke bg-selection" : "border-stroke bg-surface hover:bg-app-bg",
        (inactive || disabled) && "text-muted",
        disabled && "opacity-55",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-2.5 shrink-0 rounded-full",
          selected ? "bg-victory-stroke" : inactive ? "bg-stroke" : "bg-muted",
        )}
      />
      <AvatarInitials
        initials={player.initials}
        className={cn("size-12 text-base", (inactive || disabled) && "bg-app-bg text-muted")}
      />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-base font-bold", inactive || disabled ? "text-muted" : "text-ink")}>
          {player.name}
        </span>
        {inactive ? <span className="block text-xs font-semibold text-muted">{player.status}</span> : null}
      </span>
    </button>
  );
}

function getRequiredCount(format: MatchFormat) {
  return format === "singles" ? 1 : 2;
}

function normalizeSelection(selection: PlayerSelection, requiredCount: number): PlayerSelection {
  const slots = selection.slice(0, requiredCount);

  while (slots.length < requiredCount) {
    slots.push(null);
  }

  return slots;
}

function describeSelection(selection: PlayerSelection, players: AppPlayer[]) {
  return selection
    .map((playerId, index) => {
      const player = players.find((candidate) => candidate.id === playerId);
      return player ? shortenName(player.name) : `Empty slot ${index + 1}`;
    })
    .join(", ");
}

function compactSelection(selection: PlayerSelection): string[] {
  return selection.filter((playerId): playerId is string => Boolean(playerId));
}

function shortenName(name: string) {
  const [firstName, ...rest] = name.trim().split(/\s+/);
  const lastName = rest.at(-1);

  if (!firstName || !lastName) {
    return name;
  }

  return `${firstName} ${lastName.charAt(0)}.`;
}
