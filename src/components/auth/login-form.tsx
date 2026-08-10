"use client";

import Script from "next/script";
import { useRef, useState, useTransition } from "react";
import { KeyRound, Mail, RefreshCw } from "lucide-react";
import { signInWithOtp, verifyEmailOtp } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_AUTH_NEXT_PATH, getSafeAuthNextPath } from "@/lib/auth/next-path";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function redirectTo(url: string) {
  window.location.assign(url);
}

type GoogleCredentialResponse = { credential?: string };

type GoogleIdentity = {
  initialize: (options: {
    client_id: string;
    nonce: string;
    callback: (response: GoogleCredentialResponse) => void;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type: "standard";
      theme: "outline";
      size: "large";
      text: "continue_with";
      shape: "rectangular";
      logo_alignment: "left";
      width: number;
    },
  ) => void;
};

function getGoogleIdentity() {
  return (window as typeof window & { google?: { accounts?: { id?: GoogleIdentity } } }).google?.accounts?.id;
}

async function createGoogleNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = btoa(String.fromCharCode(...bytes));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce));
  const hashedNonce = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");

  return { nonce, hashedNonce };
}

export function LoginForm({ initialNextPath = DEFAULT_AUTH_NEXT_PATH, initialMessage = "Use Google or request a one-time email code to sign in.", onRedirect = redirectTo }: { initialNextPath?: string; initialMessage?: string; onRedirect?: (url: string) => void }) {
  const nextPath = getSafeAuthNextPath(initialNextPath);
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const [isPending, startTransition] = useTransition();
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const googleNonceRef = useRef("");
  const googleInitializedRef = useRef(false);

  function sendEmailCode(nextEmail: string) {
    startTransition(async () => {
      const result = await signInWithOtp(nextEmail, nextPath);
      setMessage(result.message ?? (result.ok ? "Check your email for the sign-in code." : "Could not send code."));

      if (result.ok && result.data.redirectTo) {
        onRedirect(getSafeAuthNextPath(result.data.redirectTo));
        return;
      }

      if (result.ok) {
        setCodeSent(true);
        setToken("");
      }
    });
  }

  async function handleGoogleCredential(response: GoogleCredentialResponse) {
    if (!response.credential || !googleNonceRef.current) {
      setMessage("Could not complete Google sign-in.");
      return;
    }

    setMessage("Signing in with Google.");

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: response.credential,
        nonce: googleNonceRef.current,
      });

      if (error) {
        throw error;
      }

      onRedirect(nextPath);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not complete Google sign-in.");
    }
  }

  async function initializeGoogleSignIn() {
    const google = getGoogleIdentity();
    const button = googleButtonRef.current;
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    if (googleInitializedRef.current || !google || !button) {
      return;
    }

    if (!clientId) {
      setMessage("Google sign-in is not configured.");
      return;
    }

    googleInitializedRef.current = true;

    try {
      const { nonce, hashedNonce } = await createGoogleNonce();
      googleNonceRef.current = nonce;
      google.initialize({
        client_id: clientId,
        nonce: hashedNonce,
        callback: (response) => void handleGoogleCredential(response),
      });
      google.renderButton(button, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "left",
        width: Math.max(200, Math.min(400, button.clientWidth)),
      });
    } catch {
      googleInitializedRef.current = false;
      setMessage("Could not load Google sign-in.");
    }
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
        onRedirect(nextPath);
      }
    });
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div ref={googleButtonRef} className="flex min-h-11 w-full items-center justify-center" />
      <Script
        id="google-identity-services"
        src="https://accounts.google.com/gsi/client"
        onReady={() => void initializeGoogleSignIn()}
        onError={() => setMessage("Could not load Google sign-in.")}
      />
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
