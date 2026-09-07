// @vitest-environment jsdom

import { webcrypto } from "node:crypto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { LoginForm } from "./login-form";

const actionMocks = vi.hoisted(() => ({ signInWithOtp: vi.fn() }));
const supabaseModule = vi.hoisted(() => ({ loads: 0, signInWithIdToken: vi.fn() }));
const googleMocks = vi.hoisted(() => ({ initialize: vi.fn(), renderButton: vi.fn() }));

vi.mock("@/app/actions", () => actionMocks);
vi.mock("@/lib/supabase/client", () => {
  supabaseModule.loads += 1;
  return {
    createSupabaseBrowserClient: () => ({ auth: { signInWithIdToken: supabaseModule.signInWithIdToken } }),
  };
});
vi.mock("next/script", async () => {
  const { useEffect } = await import("react");
  return {
    default: function MockScript({ onReady }: { onReady?: () => void }) {
      useEffect(() => onReady?.(), [onReady]);
      return null;
    },
  };
});

test("loads the Supabase browser module only after Google returns a credential", async () => {
  expect(supabaseModule.loads).toBe(0);
  render(<LoginForm onRedirect={() => undefined} />);

  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "player@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Send login link" }));
  await waitFor(() => expect(actionMocks.signInWithOtp).toHaveBeenCalled());
  expect(supabaseModule.loads).toBe(0);

  await waitFor(() => expect(googleMocks.initialize).toHaveBeenCalled());
  const configuration = googleMocks.initialize.mock.calls[0][0] as {
    callback: (response: { credential?: string }) => void;
  };
  configuration.callback({ credential: "google-id-token" });

  await waitFor(() => {
    expect(supabaseModule.loads).toBe(1);
    expect(supabaseModule.signInWithIdToken).toHaveBeenCalled();
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "google-client-id";
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
  Object.defineProperty(window, "google", {
    configurable: true,
    value: { accounts: { id: googleMocks } },
  });
  actionMocks.signInWithOtp.mockResolvedValue({
    ok: true,
    data: { email: "player@example.com" },
    message: "Check your email for the login link.",
  });
  supabaseModule.signInWithIdToken.mockResolvedValue({ error: null });
});
