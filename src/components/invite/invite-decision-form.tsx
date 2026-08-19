"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { joinGroupByInvite, type InviteSummary } from "@/app/actions";
import { Button } from "@/components/ui/button";
import styles from "./invite-decision-form.module.css";

function redirectTo(url: string) {
  window.location.assign(url);
}

export function InviteDecisionForm({
  token,
  summary,
  mode,
  onRedirect = redirectTo,
}: {
  token: string;
  summary: InviteSummary;
  mode: "invite" | "already-member";
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
          : "/home",
      );
    });
  }

  return (
    <div className={styles.form}>
      <div className={styles.summary}>
        <h2 className={styles.groupName}>{summary.groupName}</h2>
        <p className={styles.lastActive}>{summary.lastActiveText}</p>
        <p className={styles.memberCount}>
          {summary.memberCount} {summary.memberCount === 1 ? "player" : "players"}
        </p>
      </div>
      {mode === "already-member" ? (
        <Button asChild>
          <Link href={`/groups/${summary.groupId}`}>Ok</Link>
        </Button>
      ) : (
        <>
          <Button type="button" disabled={isPending} onClick={acceptInvite}>
            {isPending ? "Accepting" : "Accept"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => onRedirect("/groups/new")}>
            No thanks
          </Button>
          {message ? <p className={styles.message}>{message}</p> : null}
        </>
      )}
    </div>
  );
}
