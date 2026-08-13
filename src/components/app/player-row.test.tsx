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
  test("shows a stable ranked row with games metadata and a right-aligned rating deviation stack", () => {
    render(<PlayerRow player={player} />);

    const row = screen.getByRole("article");
    expect(row.className).toContain("h-[70px]");
    expect(row.className).toContain("shrink-0");
    expect(screen.getByLabelText("Rank 1").textContent).toBe("#1");
    expect(screen.getByText("18 games")).toBeTruthy();
    expect(screen.queryByText(/RD 72 -/)).toBeNull();

    const rating = screen.getByText("1640");
    expect(rating.className).toContain("font-bold");
    expect(rating.parentElement?.className).toContain("text-right");
    expect(rating.parentElement?.className).toContain("tabular-nums");
    expect(screen.getByText("± 72 RD").className).toContain("text-muted");
  });
});
