// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { type AppPlayer } from "@/lib/app-data";
import { GroupMembersDisclosure } from "./group-members-disclosure";

const players: AppPlayer[] = [
  { id: "alice", name: "Alice Tan", initials: "AT", role: "Owner", rating: 1640, rd: 72, rank: 1, gamesPlayed: 18, status: "Active" },
  { id: "bea", name: "Bea Rivera", initials: "BR", role: "Member", rating: 1580, rd: 81, rank: 2, gamesPlayed: 14, status: "Active" },
];

const longRoster: AppPlayer[] = Array.from({ length: 6 }, (_, index) => ({
  id: `player-${index + 1}`,
  name: `Player ${index + 1}`,
  initials: `P${index + 1}`,
  role: "Member" as const,
  rating: 1600 - index * 10,
  rd: 70 + index,
  rank: index + 1,
  gamesPlayed: 10 + index,
  status: "Active" as const,
}));

describe("GroupMembersDisclosure", () => {
  test("keeps the full-width invite action visible below the collapsed member details", () => {
    render(<GroupMembersDisclosure players={players} inviteHref="/groups/group-1/invite" />);

    const summary = screen.getByText("Members (2)");
    const details = summary.closest("details");
    expect(details?.open).toBe(false);

    const invite = screen.getByRole("link", { name: "Invite members" });
    expect(invite.closest("details")).toBeNull();
    expect(details?.parentElement?.tagName).toBe("SECTION");
    expect(details?.nextElementSibling?.contains(invite)).toBe(true);

    fireEvent.click(summary);

    expect(details?.open).toBe(true);
    expect(screen.getByText("Alice Tan")).toBeTruthy();
    expect(screen.getByText("1640")).toBeTruthy();
    expect(screen.getByText("Bea Rivera")).toBeTruthy();
    expect(invite.getAttribute("href")).toBe("/groups/group-1/invite");
  });

  test("makes a six-member roster a keyboard-focusable scroll region", () => {
    render(<GroupMembersDisclosure players={longRoster} inviteHref="/groups/group-1/invite" />);

    const region = screen.getByRole("region", { name: "Group members" });
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.className).toContain("max-h-[425px]");
    expect(region.className).toContain("overflow-y-auto");
    expect(region.className).toContain("rounded-lg");
    expect(region.className).toContain("focus-visible:outline");
    expect(region.className).toContain("focus-visible:outline-2");
    expect(region.className).toContain("focus-visible:outline-offset-2");
    expect(region.className).toContain("focus-visible:outline-action");
  });

  test("keeps short rosters unfocusable and omits the roster wrapper for an empty group", () => {
    const { rerender } = render(<GroupMembersDisclosure players={players} inviteHref="/groups/group-1/invite" />);

    expect(screen.getByRole("region", { name: "Group members" }).getAttribute("tabindex")).toBeNull();

    rerender(<GroupMembersDisclosure players={[]} inviteHref="/groups/group-1/invite" />);

    expect(screen.getByText("Members (0)")).toBeTruthy();
    expect(screen.getByText("No members yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Invite members" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Group members" })).toBeNull();
  });
});
