// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { type AppPlayer } from "@/lib/app-data";
import { PlayerRow } from "./player-row";

const player: AppPlayer = {
  id: "alice",
  name: "Alice Tan",
  initials: "AT",
  role: "Owner",
  rating: 1640,
  rd: 72,
  rank: 1,
  gamesPlayed: 18,
  status: "Active",
};

describe("PlayerRow", () => {
  test("links the full ranked row to the player's analytics with an accessible name", () => {
    render(<PlayerRow player={player} analyticsHref="/groups/group-1/players/alice/analytics" />);

    const row = screen.getByRole("article");
    const link = screen.getByRole("link", { name: "View analytics for Alice Tan" });
    expect(row.contains(link)).toBe(true);
    expect(link.getAttribute("href")).toBe("/groups/group-1/players/alice/analytics");
    expect(screen.getByLabelText("Rank 1").textContent).toBe("#1");
    expect(screen.getByText("18 games")).toBeTruthy();
    expect(screen.queryByText(/RD 72 -/)).toBeNull();

    const rating = screen.getByText("1640");
    expect(rating).toBeTruthy();
    expect(screen.getByText("± 72 RD")).toBeTruthy();
  });
});
