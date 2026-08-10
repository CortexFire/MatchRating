import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import LoginPage from "./page";

vi.mock("@/components/auth/login-form", () => ({
  LoginForm: () => <form aria-label="Sign in" />,
}));

describe("login page", () => {
  test("does not show the retired ratings-isolation message", async () => {
    const markup = renderToStaticMarkup(await LoginPage({}));

    expect(markup).not.toContain(
      "Track matches, confirm scores, and keep every group rating isolated.",
    );
  });
});
