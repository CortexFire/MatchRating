"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { MatchHistoryList } from "@/components/match/match-history-list";
import { type MatchHistoryPage } from "@/lib/matches/history-pagination";
import styles from "./deferred-player-history.module.css";

type LoadState =
  | { status: "idle" | "loading"; page: null }
  | { status: "ready"; page: MatchHistoryPage }
  | { status: "error"; page: null };

const INITIAL_STATE: LoadState = { status: "idle", page: null };

export function DeferredPlayerHistory({
  groupId,
  playerId,
  playerName,
}: {
  groupId: string;
  playerId: string;
  playerName: string;
}) {
  const [state, setState] = useState<LoadState>(INITIAL_STATE);
  const requestRef = useRef<AbortController | null>(null);

  async function loadHistory() {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setState({ status: "loading", page: null });

    const parameters = new URLSearchParams({ groupId, playerId });
    try {
      const response = await fetch(`/api/matches/history?${parameters.toString()}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("History request failed");
      const page = await response.json() as MatchHistoryPage;
      if (!controller.signal.aborted) setState({ status: "ready", page });
    } catch {
      if (!controller.signal.aborted) setState({ status: "error", page: null });
    }
  }

  useEffect(() => () => requestRef.current?.abort(), []);

  return (
    <section className={styles.section}>
      <details
        className={styles.details}
        onToggle={(event) => {
          if (event.currentTarget.open && state.status === "idle") void loadHistory();
        }}
      >
        <summary className={styles.summary}>
          <span>Match history</span>
          <ChevronDown className={styles.chevron} aria-hidden="true" />
        </summary>
        <div className={styles.content}>
          {state.status === "loading" ? (
            <p className={styles.stateMessage} role="status" aria-live="polite">Loading match history…</p>
          ) : null}
          {state.status === "error" ? (
            <div className={styles.errorState}>
              <p role="alert">Could not load match history. Try again.</p>
              <button type="button" onClick={() => void loadHistory()}>Retry loading history</button>
            </div>
          ) : null}
          {state.status === "ready" ? (
            <MatchHistoryList
              key={`${groupId}:${playerId}`}
              initialPage={state.page}
              groupId={groupId}
              playerId={playerId}
              variant="embedded"
              regionLabel={`${playerName} match history`}
            />
          ) : null}
        </div>
      </details>
    </section>
  );
}
