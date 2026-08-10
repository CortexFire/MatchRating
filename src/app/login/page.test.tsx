import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import LoginPage from "./page";

vi.mock("@/components/auth/login-form", () => ({
  LoginForm: ({ initialNextPath }: { initialNextPath?: string }) => (
    <form aria-label="Sign in" data-next-path={initialNextPath} />
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
});
