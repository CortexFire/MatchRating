"use client";

import { Search, UserPlus } from "lucide-react";
import clsx from "clsx";
import { GroupSwitcher, type GroupOption } from "@/components/match/group-switcher";
import { RatingValue } from "@/components/ratings/rating-value";
import { AvatarInitials } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type AppPlayer } from "@/lib/app-data";
import { type MatchFormat, type Team } from "@/lib/matches/validation";
import styles from "./player-select-view.module.css";

export type PlayerFilter = "selected" | "all" | "active" | "inactive";
export type PlayerSelection = Array<string | null>;

type PlayerSelectViewProps = {
  players: AppPlayer[];
  groups: GroupOption[];
  currentGroupId: string;
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
  groups,
  currentGroupId,
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
  const canCommit = selectedPlayerIds.length > 0 && selectedIds.size === selectedPlayerIds.length;
  const searchTerm = guestName.toLowerCase();

  const visiblePlayers = players
    .filter((player) => {
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
    })
    .sort(comparePlayersByFirstName);

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
    <section className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Player Select</h1>
        <GroupSwitcher groups={groups} currentGroupId={currentGroupId} />
      </div>

      <div className={styles.teamGrid}>
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

      <div className={styles.selectorCard}>
        <div className={styles.filters}>
          {filters.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              aria-label={`Filter ${option.label}`}
              onClick={() => onFilterChange(option.value)}
              className={clsx(styles.filterButton, filter === option.value && styles.filterActive)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className={styles.searchRow}>
          <label className={styles.searchLabel}>
            <span className={styles.srOnly}>Add a guest or search for a player</span>
            <Search
              aria-hidden="true"
              className={styles.searchIcon}
            />
            <Input
              type="search"
              value={search}
              placeholder="Add a guest or search for a player"
              onChange={(event) => onSearchChange(event.target.value)}
              className={styles.searchInput}
            />
          </label>
          <Button
            type="button"
            disabled={!canAddGuest}
            aria-label={guestAddLabel}
            onClick={() => onAddGuest(guestName)}
            className={clsx(styles.addGuestButton, !canAddGuest && styles.addGuestDisabled)}
          >
            <UserPlus aria-hidden="true" className={styles.addGuestIcon} />
          </Button>
        </div>

        <div
          role="region"
          aria-label="Available players"
          tabIndex={visiblePlayers.length > 5 ? 0 : undefined}
          className={styles.roster}
        >
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
            <p className={styles.emptyState}>
              No players found.
            </p>
          ) : null}
        </div>
      </div>

      <div className={styles.actions}>
        <Button type="button" disabled={!canCommit} onClick={onCommit} className={styles.actionButton}>
          Add players
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} className={styles.actionButton}>
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
    <div className={styles.teamPreview}>
      <span className={styles.teamLabel}>{label}</span>
      <button
        type="button"
        aria-label={`Select ${label}: ${describeSelection(selection, players)}`}
        aria-pressed={active}
        onClick={onSelect}
        className={clsx(styles.teamButton, active ? styles.teamActive : styles.teamIdle)}
      >
        {selection.map((playerId, index) => {
          const player = players.find((candidate) => candidate.id === playerId);

          return (
            <span
              key={`${label}-${index}`}
              aria-label={player ? `Draft ${label} player ${player.name}` : undefined}
              className={styles.teamSlot}
            >
              <AvatarInitials
                initials={player?.initials ?? `${index + 1}`}
                className={clsx(styles.previewAvatar, !player && styles.emptyAvatar)}
              />
              <span className={styles.previewDetails}>
                <span className={styles.previewName}>{player ? shortenName(player.name) : "Empty"}</span>
                {player ? <RatingValue rating={player.rating} rd={player.rd} className={styles.previewRating} /> : null}
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
      className={clsx(
        styles.playerButton,
        selected ? styles.playerSelected : styles.playerIdle,
        (inactive || disabled) && styles.playerMuted,
        disabled && styles.playerDisabled,
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(styles.statusDot, selected ? styles.statusSelected : inactive ? styles.statusInactive : styles.statusActive)}
      />
      <AvatarInitials
        initials={player.initials}
        className={clsx(styles.playerAvatar, (inactive || disabled) && styles.playerAvatarMuted)}
      />
      <span className={styles.playerDetails}>
        <span className={clsx(styles.playerName, (inactive || disabled) ? styles.playerNameMuted : styles.playerNameActive)}>
          {player.name}
        </span>
        {inactive ? <span className={styles.playerStatus}>{player.status}</span> : null}
      </span>
      <RatingValue rating={player.rating} rd={player.rd} className={styles.playerRating} />
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

function comparePlayersByFirstName(left: AppPlayer, right: AppPlayer) {
  const leftFirstName = left.name.trim().split(/\s+/, 1)[0] ?? "";
  const rightFirstName = right.name.trim().split(/\s+/, 1)[0] ?? "";
  const firstNameOrder = leftFirstName.localeCompare(rightFirstName, undefined, { sensitivity: "base" });

  return firstNameOrder || left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
}

function shortenName(name: string) {
  const [firstName, ...rest] = name.trim().split(/\s+/);
  const lastName = rest.at(-1);

  if (!firstName || !lastName) {
    return name;
  }

  return `${firstName} ${lastName.charAt(0)}.`;
}
