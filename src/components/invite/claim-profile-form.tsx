"use client";

import { useState, useTransition } from "react";
import { claimGuestProfiles, type ClaimableGuestProfile } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

      onRedirect(`/groups/${result.data.groupId}`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-center text-xl font-bold leading-7 text-muted">Are any of these you?</h1>
      <div className="rounded-lg border border-stroke bg-white p-2">
        <div className="flex flex-col gap-2">
          {profiles.map((profile) => {
            const selected = selectedIds.includes(profile.id);
            return (
              <button
                key={profile.id}
                type="button"
                aria-label={`Select ${profile.name}`}
                onClick={() => toggle(profile.id)}
                className={cn(
                  "flex min-h-[58px] items-center justify-between gap-3 rounded-lg border px-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action",
                  selected ? "border-victory-stroke bg-selection" : "border-stroke bg-surface",
                )}
              >
                <span className="text-sm font-bold text-ink">{profile.name}</span>
                <span className="min-w-14 rounded-lg border border-stroke bg-surface px-3 py-2 text-center">
                  <span className="block text-sm font-bold text-action">#{profile.rank}</span>
                  <span className="block text-[10px] font-semibold text-muted">{profile.rating}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <Button type="button" disabled={isPending || selectedIds.length === 0} onClick={submitClaim}>
        {isPending ? "Claiming" : "That's me"}
      </Button>
      <Button type="button" variant="secondary" onClick={() => onRedirect(`/groups/${groupId}`)}>
        Skip
      </Button>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </div>
  );
}
