// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ClaimProfileForm } from "./claim-profile-form";

const actionMocks = vi.hoisted(() => ({
  claimGuestProfiles: vi.fn(),
}));

vi.mock("@/app/actions", () => actionMocks);

describe("ClaimProfileForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionMocks.claimGuestProfiles.mockResolvedValue({ ok: true, data: { groupId: "group-1" } });
  });

  test("submits every selected guest profile", async () => {
    const redirects: string[] = [];
    render(
      <ClaimProfileForm
        groupId="group-1"
        profiles={[
          { id: "guest-1", name: "Jordan Lee", rating: 1631, rank: 3 },
          { id: "guest-2", name: "Amanda Xu", rating: 1478, rank: 8 },
        ]}
        onRedirect={(url) => redirects.push(url)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select Jordan Lee" }));
    fireEvent.click(screen.getByRole("button", { name: "Select Amanda Xu" }));
    fireEvent.click(screen.getByRole("button", { name: "That's me" }));

    await waitFor(() => {
      expect(actionMocks.claimGuestProfiles).toHaveBeenCalledWith({
        groupId: "group-1",
        guestProfileIds: ["guest-1", "guest-2"],
      });
      expect(redirects).toEqual(["/groups/group-1"]);
    });
  });
});
