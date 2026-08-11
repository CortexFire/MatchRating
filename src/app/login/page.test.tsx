import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import LoginPage from "./page";

vi.mock("@/components/auth/login-form", () => ({
  LoginForm: ({ initialNextPath, initialMessage }: { initialNextPath?: string; initialMessage?: string }) => (
    <form aria-label="Sign in" data-next-path={initialNextPath} data-initial-message={initialMessage} />
  ),
}));

describe("login page", () => {
  test("does not show the retired ratings-isolation message", async () => {
    const markup = renderToStaticMarkup(await LoginPage({}));

    expect(markup).not.toContain(
      "Track matches, confirm scores, and keep every group rating isolated.",
    );
  });

  test.each([
    { next: "//evil.example.com", want: "/onboarding" },
    { next: "/groups%252Fgroup-1", want: "/onboarding" },
    { next: "/groups/one/../two?filter=active#members", want: "/groups/two?filter=active#members" },
  ])("passes the safe next path to the form for $next", async ({ next, want }) => {
    const markup = renderToStaticMarkup(
      await LoginPage({ searchParams: Promise.resolve({ next }) }),
    );

    expect(markup).toContain(`data-next-path="${want}"`);
  });

  test("passes the safe callback failure message to the form", async () => {
    const markup = renderToStaticMarkup(
      await LoginPage({ searchParams: Promise.resolve({ error: "auth_callback_failed" }) }),
    );

    expect(markup).toContain("That sign-in link is invalid or expired. Request a new login link.");
  });

  test("does not echo arbitrary callback error values", async () => {
    const markup = renderToStaticMarkup(
      await LoginPage({ searchParams: Promise.resolve({ error: "provider-secret" }) }),
    );

    expect(markup).not.toContain("provider-secret");
  });
});
