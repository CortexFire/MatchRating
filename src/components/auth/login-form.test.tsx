// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { LoginForm } from "./login-form";

const actionMocks = vi.hoisted(() => ({
  signInWithGoogle: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyEmailOtp: vi.fn(),
}));

vi.mock("@/app/actions", () => actionMocks);

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionMocks.signInWithGoogle.mockResolvedValue({
      ok: true,
      data: { url: "https://supabase.example.com/oauth" },
    });
    actionMocks.signInWithOtp.mockResolvedValue({
      ok: true,
      data: { email: "player@example.com" },
      message: "Check your email for the sign-in code.",
    });
    actionMocks.verifyEmailOtp.mockResolvedValue({
      ok: true,
      data: { email: "player@example.com" },
      message: "Signed in.",
    });
  });

  test("starts Google sign-in and redirects to the provider URL", async () => {
    const redirects: string[] = [];
    render(<LoginForm onRedirect={(url) => redirects.push(url)} />);

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => {
      expect(actionMocks.signInWithGoogle).toHaveBeenCalled();
      expect(redirects).toEqual(["https://supabase.example.com/oauth"]);
    });
  });

  test("email submission sends a one-time code and shows code entry", async () => {
    render(<LoginForm onRedirect={() => undefined} />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "player@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send one-time code" }));

    await waitFor(() => {
      expect(actionMocks.signInWithOtp).toHaveBeenCalledWith("player@example.com");
      expect(screen.getByLabelText("One-time code")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Verify code" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Resend code" })).toBeTruthy();
    });
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
    fireEvent.click(screen.getByRole("button", { name: "Send one-time code" }));

    await waitFor(() => {
      expect(actionMocks.signInWithOtp).toHaveBeenCalledWith("alice@demo.matchrating.app");
      expect(redirects).toEqual(["/groups/11111111-1111-4111-8111-111111111111"]);
    });
    expect(screen.queryByLabelText("One-time code")).toBeNull();
  });

  test("submits the email code to verifyEmailOtp", async () => {
    const redirects: string[] = [];
    render(<LoginForm onRedirect={(url) => redirects.push(url)} />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "player@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send one-time code" }));
    await screen.findByLabelText("One-time code");

    fireEvent.change(screen.getByLabelText("One-time code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }));

    await waitFor(() => {
      expect(actionMocks.verifyEmailOtp).toHaveBeenCalledWith({
        email: "player@example.com",
        token: "123456",
      });
      expect(redirects).toEqual(["/groups/new"]);
    });
  });

  test("keeps the user on the form when code verification fails", async () => {
    actionMocks.verifyEmailOtp.mockResolvedValue({
      ok: false,
      message: "Invalid code.",
    });
    const redirects: string[] = [];
    render(<LoginForm onRedirect={(url) => redirects.push(url)} />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "player@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send one-time code" }));
    await screen.findByLabelText("One-time code");

    fireEvent.change(screen.getByLabelText("One-time code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }));

    await waitFor(() => {
      expect(screen.getByText("Invalid code.")).toBeTruthy();
      expect(redirects).toEqual([]);
    });
  });
});
