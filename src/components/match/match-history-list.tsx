"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Search } from "lucide-react";
import { MatchRow } from "@/components/app/match-row";
import { Input } from "@/components/ui/input";
import { type MatchHistoryPage } from "@/lib/matches/history-pagination";
import styles from "./match-history-list.module.css";

type Filter = "all" | "disputed";
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
    <div className={styles.history}>
      <div className={styles.filters}>
        <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>All</FilterButton>
        <FilterButton active={filter === "disputed"} onClick={() => setFilter("disputed")}>Disputed</FilterButton>
      </div>
      <div className={styles.searchField}>
        <Search aria-hidden="true" className={styles.searchIcon} />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} maxLength={80} className={styles.searchInput} placeholder="Search matches" />
      </div>
      {pendingRequest === "replace" ? <p role="status" aria-live="polite" className={styles.loading}>Loading history…</p> : null}
      {matches.length ? (
        <div className={styles.matchList}>
          {matches.map((match) => (
            <MatchRow key={match.id} match={match} showGroupName={showGroupName} heading="participants" />
          ))}
        </div>
      ) : (
        <p className={styles.emptyState}>
          {hasDisplayedQuery ? "No matches match these filters." : "No matches recorded yet."}
        </p>
      )}
      {error ? (
        <div className={styles.errorState}>
          <p role="alert" className={styles.errorMessage}>{error}</p>
          {failedReplacement ? (
            <button
              type="button"
              onClick={() => void fetchPage({
                append: false,
                status: failedReplacement.filter,
                query: failedReplacement.search,
                cursor: null,
              })}
              className={styles.retryButton}
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
          className={styles.loadMoreButton}
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
      className={clsx(styles.filterButton, active ? styles.filterButtonActive : styles.filterButtonInactive)}
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
