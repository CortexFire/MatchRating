// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { type AppPlayer } from "@/lib/app-data";
import { GroupMembersDisclosure } from "./group-members-disclosure";

const players: AppPlayer[] = [
  { id: "alice", name: "Alice Tan", initials: "AT", role: "Owner", rating: 1640, rd: 72, rank: 1, gamesPlayed: 18, status: "Active" },
  { id: "bea", name: "Bea Rivera", initials: "BR", role: "Guest", rating: 1580, rd: 81, rank: 2, gamesPlayed: 14, status: "Active", isGuest: true },
];

describe("GroupMembersDisclosure", () => {
  test("is initially closed and reveals ranked members plus the invite action", () => {
    render(<GroupMembersDisclosure players={players} inviteHref="/groups/group-1/invite" />);

    const summary = screen.getByText("Members (2)");
    const details = summary.closest("details");
    expect(details?.open).toBe(false);

    fireEvent.click(summary);

    expect(details?.open).toBe(true);
    expect(screen.getByText("Alice Tan")).toBeTruthy();
    expect(screen.getByText("1640")).toBeTruthy();
    expect(screen.getByText("Bea Rivera")).toBeTruthy();
    expect(screen.getByText("Guest")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Invite members" }).getAttribute("href")).toBe("/groups/group-1/invite");
  });

  test("reports zero members and preserves the invite action", () => {
    render(<GroupMembersDisclosure players={[]} inviteHref="/groups/group-1/invite" />);

    expect(screen.getByText("Members (0)")).toBeTruthy();
    expect(screen.getByText("No members yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Invite members" })).toBeTruthy();
  });
});
