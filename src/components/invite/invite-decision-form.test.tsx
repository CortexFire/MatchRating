/* @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { InviteDecisionForm } from "./invite-decision-form";

const actionMocks = vi.hoisted(() => ({
  joinGroupByInvite: vi.fn(),
}));

vi.mock("@/app/actions", () => actionMocks);

describe("InviteDecisionForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const summary = {
    groupId: "group-1",
    groupName: "Downtown Rec Club",
    memberCount: 12,
    lastActiveText: "Last active 3 days ago",
  };

  test("renders the invite summary and redeems only when accepted", async () => {
    const redirects: string[] = [];
    actionMocks.joinGroupByInvite.mockResolvedValue({ ok: true, data: { groupId: "group-1", claimableProfileCount: 2 } });

    render(<InviteDecisionForm token="invite-token" summary={summary} onRedirect={(url) => redirects.push(url)} />);

    expect(screen.getByText("Downtown Rec Club")).toBeTruthy();
    expect(screen.getByText("Last active 3 days ago")).toBeTruthy();
    expect(screen.getByText("12 players")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => {
      expect(actionMocks.joinGroupByInvite).toHaveBeenCalledWith("invite-token");
      expect(redirects).toEqual(["/groups/group-1/claim-profile"]);
    });
  });

  test("decline redirects without redeeming the invite", () => {
    const redirects: string[] = [];

    render(<InviteDecisionForm token="invite-token" summary={summary} onRedirect={(url) => redirects.push(url)} />);

    fireEvent.click(screen.getByRole("button", { name: "No thanks" }));

    expect(actionMocks.joinGroupByInvite).not.toHaveBeenCalled();
    expect(redirects).toEqual(["/groups/new"]);
  });
});