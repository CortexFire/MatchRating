"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { retryRatingRebuild } from "@/app/actions";
import { Button } from "@/components/ui/button";

const ACTIVE_POLL_INTERVAL_MS = 2_000;
const IDLE_POLL_INTERVAL_MS = 10_000;

export type RatingRebuildStatusValue = "queued" | "running" | "completed" | "failed" | null;
type RatingRebuildSnapshot = {
  id: string | null;
  status: RatingRebuildStatusValue;
  canRetry: boolean;
};

type RetryRatingAction = (input: {
  jobId: string;
  commandId: string;
}) => Promise<{
  ok: boolean;
  data?: { ratingJobId: string; ratingStatus: "queued" };
  message?: string;
}>;

export function RatingRebuildStatus({
  groupId,
  jobId,
  status,
  canRetry = false,
  showPending = true,
  retryAction = retryRatingRebuild,
}: {
  groupId: string;
  jobId?: string | null;
  status: RatingRebuildStatusValue;
  canRetry?: boolean;
  showPending?: boolean;
  retryAction?: RetryRatingAction;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState<RatingRebuildSnapshot>({
    id: jobId ?? null,
    status,
    canRetry,
  });
  const [message, setMessage] = useState("");
  const [retrying, setRetrying] = useState(false);
  const retryCommandId = useRef<string | null>(null);
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

  async function retry() {
    if (!current.id || retrying) return;
    retryCommandId.current ??= crypto.randomUUID();
    setRetrying(true);
    setMessage("");
    try {
      const result = await retryAction({ jobId: current.id, commandId: retryCommandId.current });
      if (result.ok) {
        retryCommandId.current = null;
        setCurrent((snapshot) => ({ ...snapshot, status: "queued", canRetry: false }));
        return;
      }
      setMessage(result.message ?? "Could not retry ratings.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not retry ratings.");
    } finally {
      setRetrying(false);
    }
  }

  if (current.status === "queued" || current.status === "running") {
    if (!showPending) return null;
    return <p className="rounded-lg border border-victory-stroke bg-victory p-3 text-sm font-semibold text-ink">Match saved. Ratings updating…</p>;
  }
  if (current.status === "failed") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-stroke bg-surface p-3 text-sm text-ink">
        <p className="font-semibold">Match saved, but ratings need attention.</p>
        {current.canRetry && current.id ? (
          <Button type="button" variant="secondary" onClick={retry} disabled={retrying}>
            {retrying ? "Retrying…" : "Retry ratings"}
          </Button>
        ) : (
          <p className="text-muted">An admin can retry the rating update.</p>
        )}
        {message ? <p role="alert" className="text-danger">{message}</p> : null}
      </div>
    );
  }
  return null;
}
