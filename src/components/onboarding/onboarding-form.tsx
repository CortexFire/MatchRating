"use client";

import { useState, useTransition } from "react";
import { completeOnboardingProfile } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function redirectTo(url: string) {
  window.location.assign(url);
}

export function OnboardingForm({
  inviteToken,
  onRedirect = redirectTo,
}: {
  inviteToken?: string;
  onRedirect?: (url: string) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await completeOnboardingProfile({ firstName, lastName });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }

      onRedirect(inviteToken ? `/join/${inviteToken}` : "/groups/new");
    });
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <h1 className="text-center text-2xl font-bold leading-8 text-muted">Tell us about yourself</h1>
      <label className="flex flex-col gap-2 rounded-lg border border-stroke bg-white px-3 py-2 text-sm font-semibold text-muted">
        First name
        <Input
          className="h-8 border-0 bg-transparent px-0 text-xl text-ink focus:ring-0"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-2 rounded-lg border border-stroke bg-white px-3 py-2 text-sm font-semibold text-muted">
        Last name
        <Input
          className="h-8 border-0 bg-transparent px-0 text-xl text-ink focus:ring-0"
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
          required
        />
      </label>
      <Button type="submit" disabled={isPending} className="mt-2 min-h-[52px] text-base">
        {isPending ? "Saving" : "Next"}
      </Button>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </form>
  );
}
