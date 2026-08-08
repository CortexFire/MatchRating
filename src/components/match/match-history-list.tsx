"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { MatchRow } from "@/components/app/match-row";
import { Input } from "@/components/ui/input";
import { type AppMatchSummary } from "@/lib/app-data";
import { cn } from "@/lib/utils";

type Filter = "all" | "pending_confirmation" | "disputed";

export function MatchHistoryList({ matches }: { matches: AppMatchSummary[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const visibleMatches = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return matches.filter((match) => {
      if (filter !== "all" && match.status !== filter) return false;
      if (!query) return true;
      return [
        match.format,
        displayStatus(match.status),
        ...match.teamA.map((player) => player.name),
        ...match.teamB.map((player) => player.name),
      ].some((value) => value.toLocaleLowerCase().includes(query));
    });
  }, [filter, matches, search]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>All</FilterButton>
        <FilterButton active={filter === "pending_confirmation"} onClick={() => setFilter("pending_confirmation")}>Pending</FilterButton>
        <FilterButton active={filter === "disputed"} onClick={() => setFilter("disputed")}>Disputed</FilterButton>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Search matches" />
      </div>
      {visibleMatches.length ? (
        <div className="flex flex-col gap-3">
          {visibleMatches.map((match) => (
            <MatchRow
              key={match.id}
              match={{
                id: match.id,
                groupId: match.groupId,
                format: match.format,
                status: displayStatus(match.status),
                submittedAt: formatSubmittedAt(match.submittedAt),
                teamA: match.teamA.map((player) => player.name),
                teamB: match.teamB.map((player) => player.name),
                scores: match.games.map((game) => `${game.teamAScore}-${game.teamBScore}`),
                ratingDelta: match.ratingSummary,
              }}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-stroke bg-surface p-4 text-sm text-muted">
          {matches.length ? "No matches match these filters." : "No matches recorded yet."}
        </p>
      )}
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-semibold",
        active ? "border-selection-stroke bg-selection text-ink" : "border-stroke bg-surface text-muted",
      )}
    >
      {children}
    </button>
  );
}

function displayStatus(status: AppMatchSummary["status"]) {
  if (status === "pending_confirmation") return "Pending confirmation" as const;
  if (status === "confirmed") return "Confirmed" as const;
  return "Disputed" as const;
}

function formatSubmittedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Los_Angeles",
  }).format(new Date(value));
}
