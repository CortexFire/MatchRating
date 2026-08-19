"use client";

import { useState, useTransition } from "react";
import { completeOnboardingProfile } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import styles from "./onboarding-form.module.css";

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

      onRedirect(inviteToken ? `/join/${inviteToken}` : "/home");
    });
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h1 className={styles.title}>Tell us about yourself</h1>
      <label className={styles.field}>
        First name
        <Input
          className={styles.textInput}
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          required
        />
      </label>
      <label className={styles.field}>
        Last name
        <Input
          className={styles.textInput}
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
          required
        />
      </label>
      <Button type="submit" disabled={isPending} className={styles.submitButton}>
        {isPending ? "Saving" : "Next"}
      </Button>
      {message ? <p className={styles.message}>{message}</p> : null}
    </form>
  );
}
