"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const ACTIVE_POLL_INTERVAL_MS = 2_000;

export type RatingRebuildStatusValue = "queued" | "running" | "completed" | "failed" | null;
type RatingRebuildSnapshot = {
  id: string | null;
  status: RatingRebuildStatusValue;
  canRetry: boolean;
};

export function RatingRebuildStatus({
  groupId,
  jobId,
  status,
  canRetry = false,
  showPending = true,
  refreshOnComplete = false,
}: {
  groupId: string;
  jobId?: string | null;
  status: RatingRebuildStatusValue;
  canRetry?: boolean;
  showPending?: boolean;
  refreshOnComplete?: boolean;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState<RatingRebuildSnapshot>({
    id: jobId ?? null,
    status,
    canRetry,
  });
  const refreshedCompletedJobId = useRef(status === "completed" ? jobId ?? null : null);

  useEffect(() => {
    if (current.status !== "queued" && current.status !== "running") return;

    let stopped = false;
    let inFlight = false;
    let timeoutId: number | null = null;
    let controller: AbortController | null = null;

    const schedule = () => {
      if (stopped || timeoutId !== null || document.visibilityState === "hidden") return;
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        void poll();
      }, ACTIVE_POLL_INTERVAL_MS);
    };

    const poll = async () => {
      if (stopped || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      controller = new AbortController();
      let continuePolling = true;
      try {
        const response = await fetch(`/api/groups/${groupId}/rating-status`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = (await response.json()) as RatingRebuildSnapshot;
        const next = {
          id: data.id ?? null,
          status: data.status ?? null,
          canRetry: data.canRetry === true,
        } satisfies RatingRebuildSnapshot;
        setCurrent(next);
        continuePolling = next.status === "queued" || next.status === "running";
        if (
          refreshOnComplete &&
          next.id &&
          next.status === "completed" &&
          refreshedCompletedJobId.current !== next.id
        ) {
          refreshedCompletedJobId.current = next.id;
          router.refresh();
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          continuePolling = false;
        }
        // A transient polling error must not hide the persisted status banner.
      } finally {
        inFlight = false;
        controller = null;
        if (continuePolling) schedule();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible" || inFlight) return;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      void poll();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    schedule();
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      controller?.abort();
    };
  }, [current.status, groupId, refreshOnComplete, router]);

  if (current.status === "queued" || current.status === "running") {
    if (!showPending) return null;
    return <p className="rounded-lg border border-victory-stroke bg-victory p-3 text-sm font-semibold text-ink">Match saved. Ratings updating…</p>;
  }
  if (current.status === "failed") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-stroke bg-surface p-3 text-sm text-ink">
        <p className="font-semibold">Match saved, but ratings need attention.</p>
      </div>
    );
  }
  return null;
}
