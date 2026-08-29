// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { type AppPlayer } from "@/lib/app-data";
import { type GroupRatingHistoryData } from "@/lib/navigation-read-models";
import { GroupMembersSection } from "./group-members-section";

const players: AppPlayer[] = [
  { id: "alice", name: "Alice Tan", initials: "AT", role: "Owner", rating: 1640, rd: 72, performanceSd: 85, rank: 1, gamesPlayed: 18, status: "Active" },
  { id: "bea", name: "Bea Rivera", initials: "BR", role: "Guest", rating: 1580, rd: 81, performanceSd: 91, rank: 2, gamesPlayed: 14, status: "Active", isGuest: true },
];

const unrankedPlayer: AppPlayer = {
  id: "cory",
  name: "Cory Shah",
  initials: "CS",
  role: "Member",
  rating: 1500,
  rd: 350,
  performanceSd: 200,
  rank: 0,
  gamesPlayed: 0,
  status: "Inactive",
};

const longRoster: AppPlayer[] = Array.from({ length: 6 }, (_, index) => ({
  id: `player-${index + 1}`,
  name: `Player ${index + 1}`,
  initials: `P${index + 1}`,
  role: "Member" as const,
  rating: 1600 - index * 10,
  rd: 70 + index,
  performanceSd: 80 + index,
  rank: index + 1,
  gamesPlayed: 10 + index,
  status: "Active" as const,
}));

const ratingHistory: GroupRatingHistoryData = {
  windowStart: "2025-08-26T12:00:00.000Z",
  windowEnd: "2026-08-26T12:00:00.000Z",
  series: Array.from({ length: 6 }, (_, index) => ({
    playerId: `history-player-${index + 1}`,
    name: `History Player ${index + 1}`,
    rank: index + 1,
    currentRating: 1650 - index * 20,
    points: [
      { matchId: null, occurredAt: "2025-08-26T12:00:00.000Z", rating: 1550 - index * 20 },
      { matchId: `match-${index + 1}`, occurredAt: "2026-03-01T12:00:00.000Z", rating: 1600 - index * 20 },
      { matchId: null, occurredAt: "2026-08-26T12:00:00.000Z", rating: 1650 - index * 20 },
    ],
  })),
};

describe("GroupMembersSection", () => {
  test("orders the invite action and rating chart above the collapsed member details", () => {
    render(<GroupMembersSection groupId="group-1" players={players} inviteHref="/groups/group-1/invite" ratingHistory={ratingHistory} />);

    const summary = screen.getByText("Members (2)");
    const details = summary.closest("details");
    expect(details?.open).toBe(false);

    const invite = screen.getByRole("link", { name: "Invite members" });
    expect(invite.closest("details")).toBeNull();
    expect(details?.parentElement?.tagName).toBe("SECTION");
    const section = details?.parentElement;
    const chartHeading = screen.getByRole("heading", { name: "Rating history" });
    expect(section?.children[0]?.contains(invite)).toBe(true);
    expect(section?.children[1]?.contains(chartHeading)).toBe(true);
    expect(section?.children[2]).toBe(details);

    fireEvent.click(summary);

    expect(details?.open).toBe(true);
    expect(screen.getByText("Alice Tan")).toBeTruthy();
    expect(screen.getByText("1640")).toBeTruthy();
    expect(screen.getByText("Bea Rivera")).toBeTruthy();
    expect(invite.getAttribute("href")).toBe("/groups/group-1/invite");
    expect(screen.getByText("Guest")).toBeTruthy();
    expect(screen.getByText("± 85")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View analytics for Alice Tan" }).getAttribute("href"))
      .toBe("/groups/group-1/players/alice/analytics");
    expect(screen.getByRole("link", { name: "View analytics for Bea Rivera" }).getAttribute("href"))
      .toBe("/groups/group-1/players/bea/analytics");
    expect(screen.getByRole("link", { name: "Invite members" }).getAttribute("href")).toBe("/groups/group-1/invite");
  });

  test("makes a six-member roster a keyboard-focusable scroll region", () => {
    render(<GroupMembersSection groupId="group-1" players={longRoster} inviteHref="/groups/group-1/invite" ratingHistory={ratingHistory} />);

    const region = screen.getByRole("region", { name: "Group members" });
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region).toBeTruthy();
  });

  test("keeps an unranked member visible without an analytics link", () => {
    render(
      <GroupMembersSection
        groupId="group-1"
        players={[...players, unrankedPlayer]}
        inviteHref="/groups/group-1/invite"
        ratingHistory={ratingHistory}
      />,
    );

    fireEvent.click(screen.getByText("Members (3)"));

    expect(screen.getByRole("article", { name: "Cory Shah, unranked, 0 games" })).toBeTruthy();
    expect(screen.getByText("Unranked")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "View analytics for Cory Shah" })).toBeNull();
  });

  test("keeps short rosters unfocusable and omits the roster wrapper for an empty group", () => {
    const { rerender } = render(<GroupMembersSection groupId="group-1" players={players} inviteHref="/groups/group-1/invite" ratingHistory={ratingHistory} />);

    expect(screen.getByRole("region", { name: "Group members" }).getAttribute("tabindex")).toBeNull();

    rerender(<GroupMembersSection groupId="group-1" players={[]} inviteHref="/groups/group-1/invite" ratingHistory={{ ...ratingHistory, series: [] }} />);

    expect(screen.getByText("Members (0)")).toBeTruthy();
    expect(screen.getByText("No members yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Invite members" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Group members" })).toBeNull();
  });

  test("defaults to top five and updates the legend from the local preset selector", () => {
    render(<GroupMembersSection groupId="group-1" players={players} inviteHref="/groups/group-1/invite" ratingHistory={ratingHistory} />);

    const selector = screen.getByRole("combobox", { name: "Players shown" });
    const legend = screen.getByRole("list", { name: "Rating history legend" });
    const firstLegendItem = legend.querySelector("li");
    expect((selector as HTMLSelectElement).value).toBe("5");
    expect(firstLegendItem?.getAttribute("tabindex")).toBe("0");
    expect(firstLegendItem?.getAttribute("aria-label")).toBe("History Player 1, current rating 1650");
    expect(legend.textContent).toContain("History Player 5");
    expect(legend.textContent).not.toContain("History Player 6");

    fireEvent.change(selector, { target: { value: "3" } });
    expect(legend.textContent).toContain("History Player 3");
    expect(legend.textContent).not.toContain("History Player 4");

    fireEvent.change(selector, { target: { value: "10" } });
    expect(legend.textContent).toContain("History Player 6");
  });

  test("shows the twelve-month window and a concise empty state without ranked players", () => {
    const { rerender } = render(
      <GroupMembersSection groupId="group-1" players={players} inviteHref="/groups/group-1/invite" ratingHistory={ratingHistory} />,
    );

    expect(screen.getByText("Aug 26, 2025 – Aug 26, 2026")).toBeTruthy();
    expect(screen.getByRole("table", { name: "Rating history values" })).toBeTruthy();

    rerender(
      <GroupMembersSection
        groupId="group-1"
        players={[unrankedPlayer]}
        inviteHref="/groups/group-1/invite"
        ratingHistory={{ ...ratingHistory, series: [] }}
      />,
    );

    expect(screen.getByText("Play a match to see rating history.")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Players shown" })).toBeNull();
  });
});
