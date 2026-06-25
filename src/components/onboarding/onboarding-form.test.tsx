// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { OnboardingForm } from "./onboarding-form";

const actionMocks = vi.hoisted(() => ({
  completeOnboardingProfile: vi.fn(),
}));

vi.mock("@/app/actions", () => actionMocks);

describe("OnboardingForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionMocks.completeOnboardingProfile.mockResolvedValue({ ok: true, data: { profileId: "user-1" } });
  });

  test("saves first and last name then follows the invite destination", async () => {
    const redirects: string[] = [];
    render(<OnboardingForm inviteToken="invite-token" onRedirect={(url) => redirects.push(url)} />);

    expect(screen.getByRole("heading", { name: "Tell us about yourself" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Maya" } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Chen" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(actionMocks.completeOnboardingProfile).toHaveBeenCalledWith({ firstName: "Maya", lastName: "Chen" });
      expect(redirects).toEqual(["/join/invite-token"]);
    });
  });
});
