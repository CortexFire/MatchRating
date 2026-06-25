"use client";

import { useState, useTransition } from "react";
import { KeyRound, Mail, RefreshCw } from "lucide-react";
import { signInWithGoogle, signInWithOtp, verifyEmailOtp } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const POST_LOGIN_PATH = "/onboarding";

function redirectTo(url: string) {
  window.location.assign(url);
}

export function LoginForm({ initialNextPath = POST_LOGIN_PATH, onRedirect = redirectTo }: { initialNextPath?: string; onRedirect?: (url: string) => void }) {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [message, setMessage] = useState("Use Google or request a one-time email code to sign in.");
  const [isPending, startTransition] = useTransition();

  function sendEmailCode(nextEmail: string) {
    startTransition(async () => {
      const result = await signInWithOtp(nextEmail, initialNextPath);
      setMessage(result.message ?? (result.ok ? "Check your email for the sign-in code." : "Could not send code."));

      if (result.ok && result.data.redirectTo) {
        onRedirect(result.data.redirectTo);
        return;
      }

      if (result.ok) {
        setCodeSent(true);
        setToken("");
      }
    });
  }

  function handleGoogleSignIn() {
    startTransition(async () => {
      const result = await signInWithGoogle(initialNextPath);

      if (result.ok) {
        onRedirect(result.data.url);
        return;
      }

      setMessage(result.message);
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextEmail = email.trim();

    if (!codeSent) {
      sendEmailCode(nextEmail);
      return;
    }

    const nextToken = token.replace(/\D/g, "").slice(0, 6);
    setToken(nextToken);

    if (nextToken.length !== 6) {
      setMessage("Enter the 6-digit code from your email.");
      return;
    }

    startTransition(async () => {
      const result = await verifyEmailOtp({ email: nextEmail, token: nextToken });
      setMessage(result.message ?? (result.ok ? "Signed in." : "Could not verify code."));

      if (result.ok) {
        onRedirect(initialNextPath);
      }
    });
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <Button disabled={isPending} type="button" variant="secondary" onClick={handleGoogleSignIn}>
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
      {codeSent ? (
        <label className="flex flex-col gap-2 text-sm font-semibold text-ink">
          One-time code
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={token}
            onChange={(event) => setToken(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            required
          />
        </label>
      ) : null}
      <Button disabled={isPending} type="submit">
        {codeSent ? <KeyRound className="size-4" /> : <Mail className="size-4" />}
        {isPending ? (codeSent ? "Verifying" : "Sending") : codeSent ? "Verify code" : "Send one-time code"}
      </Button>
      {codeSent ? (
        <Button disabled={isPending} type="button" variant="ghost" onClick={() => sendEmailCode(email.trim())}>
          <RefreshCw className="size-4" />
          Resend code
        </Button>
      ) : null}
      <p className="min-h-10 text-sm leading-5 text-muted">{message}</p>
    </form>
  );
}
