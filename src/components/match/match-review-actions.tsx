"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { confirmMatchRevision } from "@/app/actions";

export function MatchReviewActions({
  groupId,
  matchId,
  revisionId,
  canConfirm,
  canDispute,
}: {
  groupId: string;
  matchId: string;
  revisionId: string;
  canConfirm: boolean;
  canDispute: boolean;
}) {
  const commandId = useRef<string | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function confirm() {
    setMessage("");
    commandId.current ??= crypto.randomUUID();
    startTransition(async () => {
      const result = await confirmMatchRevision({
        groupId,
        matchId,
        revisionId,
        commandId: commandId.current!,
      });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      commandId.current = null;
    });
  }

  return (
    <div className={`mt-4 grid gap-4 ${canConfirm && canDispute ? "grid-cols-2" : "grid-cols-1"}`}>
      {canConfirm ? (
        <button
          type="button"
          disabled={pending}
          onClick={confirm}
          className="inline-flex min-h-14 min-w-11 items-center justify-center rounded-lg bg-action px-4 text-base font-semibold text-white transition hover:bg-selection-stroke focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action disabled:opacity-60"
        >
          {pending ? "Confirming…" : "Confirm"}
        </button>
      ) : null}
      {canDispute ? (
        <Link
          href={`/groups/${groupId}/matches/${matchId}/revise`}
          className="inline-flex min-h-14 min-w-11 items-center justify-center rounded-lg border border-stroke bg-surface px-4 text-base font-semibold text-ink transition hover:bg-app-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          Dispute
        </Link>
      ) : null}
      {message ? <p aria-live="polite" className="col-span-2 text-sm font-semibold text-muted">{message}</p> : null}
    </div>
  );
}
