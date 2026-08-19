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

    render(<InviteDecisionForm token="invite-token" summary={summary} mode="invite" onRedirect={(url) => redirects.push(url)} />);

    expect(screen.getByText("Downtown Rec Club")).toBeTruthy();
    expect(screen.getByText("Last active 3 days ago")).toBeTruthy();
    expect(screen.getByText("12 players")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => {
      expect(actionMocks.joinGroupByInvite).toHaveBeenCalledWith("invite-token");
      expect(redirects).toEqual(["/groups/group-1/claim-profile"]);
    });
  });

  test("accepting an invite without claimable profiles redirects home", async () => {
    const redirects: string[] = [];
    actionMocks.joinGroupByInvite.mockResolvedValue({ ok: true, data: { groupId: "group-1", claimableProfileCount: 0 } });

    render(<InviteDecisionForm token="invite-token" summary={summary} mode="invite" onRedirect={(url) => redirects.push(url)} />);

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => {
      expect(redirects).toEqual(["/home"]);
    });
  });

  test("decline redirects without redeeming the invite", () => {
    const redirects: string[] = [];

    render(<InviteDecisionForm token="invite-token" summary={summary} mode="invite" onRedirect={(url) => redirects.push(url)} />);

    fireEvent.click(screen.getByRole("button", { name: "No thanks" }));

    expect(actionMocks.joinGroupByInvite).not.toHaveBeenCalled();
    expect(redirects).toEqual(["/groups/new"]);
  });

  test("already-member mode links directly to the group without offering invite decisions", () => {
    render(<InviteDecisionForm token="invite-token" summary={summary} mode="already-member" />);

    expect(screen.getByText("Downtown Rec Club")).toBeTruthy();
    expect(screen.getByText("Last active 3 days ago")).toBeTruthy();
    expect(screen.getByText("12 players")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ok" }).getAttribute("href")).toBe("/groups/group-1");
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    expect(screen.queryByRole("button", { name: "No thanks" })).toBeNull();
    expect(actionMocks.joinGroupByInvite).not.toHaveBeenCalled();
  });

  test("uses singular player wording for a one-player invite", () => {
    render(
      <InviteDecisionForm
        token="invite-token"
        summary={{ ...summary, memberCount: 1 }}
        mode="invite"
      />,
    );

    expect(screen.getByText("1 player")).toBeTruthy();
    expect(screen.queryByText("1 players")).toBeNull();
  });
});
