"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { MatchRow } from "@/components/app/match-row";
import { Input } from "@/components/ui/input";
import { type MatchHistoryPage } from "@/lib/matches/history-pagination";
import { cn } from "@/lib/utils";

type Filter = "all" | "pending_confirmation" | "disputed";
type PendingRequest = "replace" | "append" | null;
type HistoryQuery = { filter: Filter; search: string };

export function MatchHistoryList({
  initialPage,
  groupId,
  showGroupName = false,
}: {
  initialPage: MatchHistoryPage;
  groupId?: string;
  showGroupName?: boolean;
}) {
  const [matches, setMatches] = useState(initialPage.matches);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [pendingRequest, setPendingRequest] = useState<PendingRequest>(null);
  const [error, setError] = useState<string | null>(null);
  const [displayedQuery, setDisplayedQuery] = useState<HistoryQuery>({ filter: "all", search: "" });
  const [failedReplacement, setFailedReplacement] = useState<HistoryQuery | null>(null);
  const requestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const nextRequestId = useRef(0);
  const lastQuery = useRef<{ filter: Filter; search: string }>({ filter: "all", search: "" });

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const fetchPage = useCallback(async ({
    append,
    status,
    query,
    cursor,
  }: {
    append: boolean;
    status: Filter;
    query: string;
    cursor: string | null;
  }) => {
    requestRef.current?.controller.abort();
    const controller = new AbortController();
    const requestId = ++nextRequestId.current;
    requestRef.current = { id: requestId, controller };
    setPendingRequest(append ? "append" : "replace");
    setError(null);
    if (!append) setFailedReplacement(null);

    const parameters = new URLSearchParams();
    if (groupId) parameters.set("groupId", groupId);
    if (status !== "all") parameters.set("status", status);
    if (query) parameters.set("q", query);
    if (append && cursor) parameters.set("cursor", cursor);
    const url = `/api/matches/history${parameters.size ? `?${parameters.toString()}` : ""}`;

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error("History request failed");
      const page = await response.json() as MatchHistoryPage;
      if (requestRef.current?.id !== requestId) return;
      setMatches((current) => append ? mergeMatches(current, page.matches) : page.matches);
      setNextCursor(page.nextCursor);
      if (!append) setDisplayedQuery({ filter: status, search: query });
    } catch {
      if (controller.signal.aborted || requestRef.current?.id !== requestId) return;
      if (!append) setFailedReplacement({ filter: status, search: query });
      setError(append
        ? "Could not load more matches. Try again."
        : "Could not load match history. Try again.");
    } finally {
      if (requestRef.current?.id === requestId) setPendingRequest(null);
    }
  }, [groupId]);

  useEffect(() => {
    if (lastQuery.current.filter === filter && lastQuery.current.search === debouncedSearch) return;
    lastQuery.current = { filter, search: debouncedSearch };
    void fetchPage({ append: false, status: filter, query: debouncedSearch, cursor: null });
  }, [debouncedSearch, fetchPage, filter]);

  useEffect(() => () => requestRef.current?.controller.abort(), []);

  const activeQuery = { filter, search: debouncedSearch } satisfies HistoryQuery;
  const hasDisplayedQuery = displayedQuery.filter !== "all" || Boolean(displayedQuery.search);
  const canLoadMore = nextCursor && queriesMatch(displayedQuery, activeQuery);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>All</FilterButton>
        <FilterButton active={filter === "pending_confirmation"} onClick={() => setFilter("pending_confirmation")}>Awaiting review</FilterButton>
        <FilterButton active={filter === "disputed"} onClick={() => setFilter("disputed")}>Disputed</FilterButton>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} maxLength={80} className="pl-9" placeholder="Search matches" />
      </div>
      {pendingRequest === "replace" ? <p role="status" aria-live="polite" className="text-sm text-muted">Loading history…</p> : null}
      {matches.length ? (
        <div className="flex flex-col gap-3">
          {matches.map((match) => (
            <MatchRow key={match.id} match={match} showGroupName={showGroupName} heading="participants" />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-stroke bg-surface p-4 text-sm text-muted">
          {hasDisplayedQuery ? "No matches match these filters." : "No matches recorded yet."}
        </p>
      )}
      {error ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-sm text-danger">{error}</p>
          {failedReplacement ? (
            <button
              type="button"
              onClick={() => void fetchPage({
                append: false,
                status: failedReplacement.filter,
                query: failedReplacement.search,
                cursor: null,
              })}
              className="text-sm font-semibold text-action underline-offset-2 hover:underline"
            >
              Retry loading history
            </button>
          ) : null}
        </div>
      ) : null}
      {canLoadMore ? (
        <button
          type="button"
          disabled={pendingRequest !== null}
          onClick={() => void fetchPage({
            append: true,
            status: filter,
            query: debouncedSearch,
            cursor: nextCursor,
          })}
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-stroke bg-surface px-4 text-sm font-semibold text-ink disabled:opacity-60"
        >
          {pendingRequest === "append" ? "Loading…" : "Load older matches"}
        </button>
      ) : null}
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

function mergeMatches(current: MatchHistoryPage["matches"], older: MatchHistoryPage["matches"]) {
  const matchesById = new Map(current.map((match) => [match.id, match]));
  for (const match of older) matchesById.set(match.id, match);
  return [...matchesById.values()];
}

function queriesMatch(left: HistoryQuery, right: HistoryQuery) {
  return left.filter === right.filter && left.search === right.search;
}
