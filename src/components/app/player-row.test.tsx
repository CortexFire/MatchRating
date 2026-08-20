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
  rd: 110.01,
  performanceSd: 85,
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
    expect(screen.getByText("1640?")).toBeTruthy();
    expect(screen.getByText("1640, provisional rating")).toBeTruthy();
    const description = "Estimated one-standard-deviation match-performance variation: plus or minus 85 rating points.";
    const variation = screen.getByText("± 85");
    expect(variation.getAttribute("title")).toBe(description);
    expect(variation.getAttribute("aria-label")).toBe(description);
    expect(screen.queryByText(/RD/i)).toBeNull();
  });
});
