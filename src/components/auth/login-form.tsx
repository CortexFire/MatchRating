"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { signInWithOtp } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("Use email OTP or Google OAuth once Supabase is connected.");
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await signInWithOtp(email);
          setMessage(result.message ?? (result.ok ? "Check your email." : "Could not send code."));
        });
      }}
    >
      <Button type="button" variant="secondary">
        Continue with Google
      </Button>
      <div className="flex items-center gap-3 text-xs font-semibold uppercase text-muted">
        <span className="h-px flex-1 bg-stroke" />
        or
        <span className="h-px flex-1 bg-stroke" />
      </div>
      <label className="flex flex-col gap-2 text-sm font-semibold text-ink">
        Email
        <Input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
        />
      </label>
      <div className="grid grid-cols-6 gap-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="flex h-11 items-center justify-center rounded-lg border border-stroke bg-surface text-sm font-bold text-muted"
          >
            {index === 0 ? "•" : ""}
          </div>
        ))}
      </div>
      <Button disabled={isPending} type="submit">
        <Mail className="size-4" />
        {isPending ? "Sending" : "Send one-time code"}
      </Button>
      <p className="min-h-10 text-sm leading-5 text-muted">{message}</p>
    </form>
  );
}
