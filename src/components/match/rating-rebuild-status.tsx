"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const ACTIVE_POLL_INTERVAL_MS = 2_000;
const IDLE_POLL_INTERVAL_MS = 10_000;

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
}: {
  groupId: string;
  jobId?: string | null;
  status: RatingRebuildStatusValue;
  canRetry?: boolean;
  showPending?: boolean;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState<RatingRebuildSnapshot>({
    id: jobId ?? null,
    status,
    canRetry,
  });
  const refreshedCompletedJobId = useRef(status === "completed" ? jobId ?? null : null);

  useEffect(() => {
    const poll = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch(`/api/groups/${groupId}/rating-status`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as RatingRebuildSnapshot;
        const next = {
          id: data.id ?? null,
          status: data.status ?? null,
          canRetry: data.canRetry === true,
        } satisfies RatingRebuildSnapshot;
        setCurrent(next);
        if (
          next.id &&
          next.status === "completed" &&
          refreshedCompletedJobId.current !== next.id
        ) {
          refreshedCompletedJobId.current = next.id;
          router.refresh();
        }
      } catch {
        // A transient polling error must not hide the persisted status banner.
      }
    };

    const intervalMs = current.status === "queued" || current.status === "running"
      ? ACTIVE_POLL_INTERVAL_MS
      : IDLE_POLL_INTERVAL_MS;
    const interval = window.setInterval(poll, intervalMs);
    return () => window.clearInterval(interval);
  }, [current.status, groupId, router]);

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
