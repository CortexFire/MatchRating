"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { claimGuestProfiles, type ClaimableGuestProfile } from "@/app/actions";
import { RatingValue } from "@/components/ratings/rating-value";
import { Button } from "@/components/ui/button";
import styles from "./claim-profile-form.module.css";

function redirectTo(url: string) {
  window.location.assign(url);
}

export function ClaimProfileForm({
  groupId,
  profiles,
  onRedirect = redirectTo,
}: {
  groupId: string;
  profiles: ClaimableGuestProfile[];
  onRedirect?: (url: string) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
    setMessage("");
  }

  function submitClaim() {
    startTransition(async () => {
      const result = await claimGuestProfiles({ groupId, guestProfileIds: selectedIds });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }

      onRedirect("/home");
    });
  }

  return (
    <div className={styles.form}>
      <h1 className={styles.title}>Are any of these you?</h1>
      <div className={styles.profilePanel}>
        <div className={styles.profileList}>
          {profiles.map((profile) => {
            const selected = selectedIds.includes(profile.id);
            return (
              <button
                key={profile.id}
                type="button"
                aria-label={`Select ${profile.name}`}
                aria-pressed={selected}
                onClick={() => toggle(profile.id)}
                className={clsx(styles.profileButton, selected ? styles.profileSelected : styles.profileIdle)}
              >
                <span className={styles.profileName}>{profile.name}</span>
                <span className={styles.profileRanking}>
                  <span className={styles.rank}>#{profile.rank}</span>
                  <RatingValue rating={profile.rating} rd={profile.rd} className={styles.rating} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <Button type="button" disabled={isPending || selectedIds.length === 0} onClick={submitClaim}>
        {isPending ? "Claiming" : "That's me"}
      </Button>
      <Button type="button" variant="secondary" onClick={() => onRedirect("/home")}>
        Skip
      </Button>
      {message ? <p className={styles.message}>{message}</p> : null}
    </div>
  );
}
