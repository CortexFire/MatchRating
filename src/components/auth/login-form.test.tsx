// @vitest-environment jsdom

import { webcrypto } from "node:crypto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { LoginForm } from "./login-form";

const actionMocks = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => ({
  signInWithIdToken: vi.fn(),
}));

const googleMocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  renderButton: vi.fn(),
}));

const scriptMockState = vi.hoisted(() => ({ fail: false }));

vi.mock("@/app/actions", () => actionMocks);
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({ auth: supabaseMocks }),
}));
vi.mock("next/script", async () => {
  const { useEffect } = await import("react");

  return {
    default: function MockScript({
      onReady,
      onError,
    }: {
      onReady?: () => void;
      onError?: (error: Error) => void;
    }) {
      useEffect(() => {
        if (scriptMockState.fail) {
          onError?.(new Error("Script failed"));
        } else {
          onReady?.();
        }
      }, [onError, onReady]);

      return null;
    },
  };
});

type GoogleConfiguration = {
  client_id: string;
  nonce: string;
  callback: (response: { credential?: string }) => void;
};

async function hashNonce(nonce: string) {
  const digest = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scriptMockState.fail = false;
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "google-client-id";
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: webcrypto,
    });
    Object.defineProperty(window, "google", {
      configurable: true,
      value: { accounts: { id: googleMocks } },
    });
    googleMocks.renderButton.mockImplementation((parent: HTMLElement) => {
      const button = document.createElement("button");
      button.textContent = "Continue with Google";
      parent.appendChild(button);
    });
    supabaseMocks.signInWithIdToken.mockResolvedValue({ error: null });
    actionMocks.signInWithOtp.mockResolvedValue({
      ok: true,
      data: { email: "player@example.com" },
      message: "Check your email for the login link.",
    });
  });

  test("renders Google's official sign-in button", async () => {
    render(<LoginForm onRedirect={() => undefined} />);

    await waitFor(() => {
      expect(googleMocks.initialize).toHaveBeenCalledWith({
        client_id: "google-client-id",
        nonce: expect.any(String),
        callback: expect.any(Function),
      });
      expect(googleMocks.renderButton).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
          width: 200,
        },
      );
      expect(screen.getByRole("button", { name: "Continue with Google" })).toBeTruthy();
    });
  });

  test("signs in with Google's ID token and matching nonce", async () => {
    const redirects: string[] = [];
    render(
      <LoginForm
        initialNextPath="/onboarding?invite=invite-token"
        onRedirect={(url) => redirects.push(url)}
      />,
    );

    await waitFor(() => expect(googleMocks.initialize).toHaveBeenCalled());
    const configuration = googleMocks.initialize.mock.calls[0][0] as GoogleConfiguration;
    configuration.callback({ credential: "google-id-token" });

    await waitFor(() => {
      expect(supabaseMocks.signInWithIdToken).toHaveBeenCalledWith({
        provider: "google",
        token: "google-id-token",
        nonce: expect.any(String),
      });
      expect(redirects).toEqual(["/onboarding?invite=invite-token"]);
    });

    const { nonce } = supabaseMocks.signInWithIdToken.mock.calls[0][0] as { nonce: string };
    expect(configuration.nonce).toBe(await hashNonce(nonce));
  });

  test("redirects Google sign-in through the safe next-path boundary", async () => {
    const redirects: string[] = [];
    render(
      <LoginForm
        initialNextPath="/groups%252Fgroup-1"
        onRedirect={(url) => redirects.push(url)}
      />,
    );

    await waitFor(() => expect(googleMocks.initialize).toHaveBeenCalled());
    const configuration = googleMocks.initialize.mock.calls[0][0] as GoogleConfiguration;
    configuration.callback({ credential: "google-id-token" });

    await waitFor(() => {
      expect(redirects).toEqual(["/onboarding"]);
    });
  });

  test("keeps the user on the form when Google sign-in fails", async () => {
    supabaseMocks.signInWithIdToken.mockResolvedValue({
      error: new Error("Google credential was rejected."),
    });
    const redirects: string[] = [];
    render(<LoginForm onRedirect={(url) => redirects.push(url)} />);

    await waitFor(() => expect(googleMocks.initialize).toHaveBeenCalled());
    const configuration = googleMocks.initialize.mock.calls[0][0] as GoogleConfiguration;
    configuration.callback({ credential: "bad-token" });

    expect(await screen.findByText("Google credential was rejected.")).toBeTruthy();
    expect(redirects).toEqual([]);
  });

  test("shows an error when the Google script fails to load", async () => {
    scriptMockState.fail = true;
    render(<LoginForm onRedirect={() => undefined} />);

    expect(await screen.findByText("Could not load Google sign-in.")).toBeTruthy();
    expect(googleMocks.initialize).not.toHaveBeenCalled();
  });

  test("email submission sends a login link without showing code entry", async () => {
    render(<LoginForm onRedirect={() => undefined} />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "player@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send login link" }));

    await waitFor(() => {
      expect(actionMocks.signInWithOtp).toHaveBeenCalledWith("player@example.com", "/onboarding");
      expect(screen.getByText("Check your email for the login link.")).toBeTruthy();
    });
    expect(screen.queryByLabelText("One-time code")).toBeNull();
    expect(screen.queryByRole("button", { name: "Verify code" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Resend code" })).toBeNull();
  });

  test("email submission redirects immediately for demo login results", async () => {
    actionMocks.signInWithOtp.mockResolvedValue({
      ok: true,
      data: {
        email: "alice@demo.matchrating.app",
        redirectTo: "/groups/11111111-1111-4111-8111-111111111111",
      },
      message: "Signed in as Alice Tan.",
    });
    const redirects: string[] = [];
    render(<LoginForm onRedirect={(url) => redirects.push(url)} />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "alice@demo.matchrating.app" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send login link" }));

    await waitFor(() => {
      expect(actionMocks.signInWithOtp).toHaveBeenCalledWith("alice@demo.matchrating.app", "/onboarding");
      expect(redirects).toEqual(["/groups/11111111-1111-4111-8111-111111111111"]);
    });
    expect(screen.queryByLabelText("One-time code")).toBeNull();
  });

  test("redirects demo sign-in results through the safe next-path boundary", async () => {
    actionMocks.signInWithOtp.mockResolvedValue({
      ok: true,
      data: {
        email: "alice@demo.matchrating.app",
        redirectTo: "https://evil.example.com",
      },
      message: "Signed in as Alice Tan.",
    });
    const redirects: string[] = [];
    render(<LoginForm onRedirect={(url) => redirects.push(url)} />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "alice@demo.matchrating.app" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send login link" }));

    await waitFor(() => {
      expect(redirects).toEqual(["/onboarding"]);
    });
  });

  test("allows another login-link request from the same button", async () => {
    render(<LoginForm onRedirect={() => undefined} />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "player@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send login link" }));
    await screen.findByText("Check your email for the login link.");

    fireEvent.click(screen.getByRole("button", { name: "Send login link" }));

    await waitFor(() => {
      expect(actionMocks.signInWithOtp).toHaveBeenCalledTimes(2);
    });
  });

  test("passes invite next paths through email link requests", async () => {
    const redirects: string[] = [];
    render(<LoginForm initialNextPath="/onboarding?invite=invite-token" onRedirect={(url) => redirects.push(url)} />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "player@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send login link" }));

    await waitFor(() => {
      expect(actionMocks.signInWithOtp).toHaveBeenCalledWith("player@example.com", "/onboarding?invite=invite-token");
      expect(screen.getByText("Check your email for the login link.")).toBeTruthy();
    });
    expect(redirects).toEqual([]);
  });

  test("keeps the user on the form when sending the login link fails", async () => {
    actionMocks.signInWithOtp.mockResolvedValue({
      ok: false,
      message: "Email provider is unavailable.",
    });
    const redirects: string[] = [];
    render(<LoginForm onRedirect={(url) => redirects.push(url)} />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "player@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send login link" }));

    await waitFor(() => {
      expect(screen.getByText("Email provider is unavailable.")).toBeTruthy();
      expect(redirects).toEqual([]);
    });
  });

  test("shows a safe initial callback failure message", async () => {
    render(
      <LoginForm
        initialMessage="That sign-in link is invalid or expired. Request a new login link."
        onRedirect={() => undefined}
      />,
    );

    expect(screen.getByText("That sign-in link is invalid or expired. Request a new login link.")).toBeTruthy();
  });
});
