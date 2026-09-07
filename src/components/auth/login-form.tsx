"use client";

import Script from "next/script";
import { useRef, useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { signInWithOtp } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_AUTH_NEXT_PATH, getSafeAuthNextPath } from "@/lib/auth/next-path";
import styles from "./login-form.module.css";

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

export function LoginForm({ initialNextPath = DEFAULT_AUTH_NEXT_PATH, initialMessage = "Use Google or request a login link by email.", onRedirect = redirectTo }: { initialNextPath?: string; initialMessage?: string; onRedirect?: (url: string) => void }) {
  const nextPath = getSafeAuthNextPath(initialNextPath);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState(initialMessage);
  const [isPending, startTransition] = useTransition();
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const googleNonceRef = useRef("");
  const googleInitializedRef = useRef(false);

  function sendLoginLink(nextEmail: string) {
    startTransition(async () => {
      const result = await signInWithOtp(nextEmail, nextPath);
      setMessage(result.message ?? (result.ok ? "Check your email for the login link." : "Could not send login link."));

      if (result.ok && result.data.redirectTo) {
        onRedirect(getSafeAuthNextPath(result.data.redirectTo));
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
      const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
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
    sendLoginLink(email.trim());
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div ref={googleButtonRef} className={styles.googleButton} />
      <Script
        id="google-identity-services"
        src="https://accounts.google.com/gsi/client"
        onReady={() => void initializeGoogleSignIn()}
        onError={() => setMessage("Could not load Google sign-in.")}
      />
      <div className={styles.divider}>
        <span className={styles.dividerLine} />
        or
        <span className={styles.dividerLine} />
      </div>
      <label className={styles.emailLabel}>
        Email
        <Input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
        />
      </label>
      <Button disabled={isPending} type="submit">
        <Mail className={styles.mailIcon} />
        {isPending ? "Sending" : "Send login link"}
      </Button>
      <p className={styles.message}>{message}</p>
    </form>
  );
}
