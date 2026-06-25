"use client";

import { useState, useTransition } from "react";
import { joinGroupByInvite, type InviteSummary } from "@/app/actions";
import { Button } from "@/components/ui/button";

function redirectTo(url: string) {
  window.location.assign(url);
}

export function InviteDecisionForm({
  token,
  summary,
  onRedirect = redirectTo,
}: {
  token: string;
  summary: InviteSummary;
  onRedirect?: (url: string) => void;
}) {
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function acceptInvite() {
    startTransition(async () => {
      const result = await joinGroupByInvite(token);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }

      onRedirect(
        result.data.claimableProfileCount > 0
          ? `/groups/${result.data.groupId}/claim-profile`
          : `/groups/${result.data.groupId}`,
      );
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-stroke bg-white px-4 py-7 text-center">
        <h2 className="text-2xl font-bold leading-8 text-ink">{summary.groupName}</h2>
        <p className="mt-7 text-xs text-muted">{summary.lastActiveText}</p>
        <p className="mt-3 text-xs text-muted">{summary.memberCount} players</p>
      </div>
      <Button type="button" disabled={isPending} onClick={acceptInvite}>
        {isPending ? "Accepting" : "Accept"}
      </Button>
      <Button type="button" variant="secondary" onClick={() => onRedirect("/groups/new")}>
        No thanks
      </Button>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </div>
  );
}
