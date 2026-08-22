// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { type PlayerAnalyticsViewModel } from "@/lib/analytics/analytics-policy";
import { PlayerAnalyticsView } from "./player-analytics-view";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

const readyModel: PlayerAnalyticsViewModel = {
  status: "ready",
  asOf: "2026-08-19T12:00:00.000Z",
  viewerUserId: "alice",
  subject: { id: "alice", name: "Alice Tan" },
  group: { id: "group-1", name: "Downtown Rec" },
  availableGroups: [
    { id: "group-1", name: "Downtown Rec" },
    { id: "group-2", name: "Wednesday Club" },
  ],
  periods: {
    all: {
      summary: { rank: 1, rankedPlayerCount: 18, currentRating: 1578, currentRd: 110.01, ratingChange: 42, wins: 18, losses: 10, winRate: 64 },
      ratingHistory: [
        { matchId: "m1", occurredAt: "2026-07-20T12:00:00.000Z", rating: 1566, rd: 110, performanceSd: 200, ratingDelta: 8 },
        { matchId: "m2", occurredAt: "2026-08-01T12:00:00.000Z", rating: 1578, rd: 110.01, performanceSd: 85, ratingDelta: 12 },
      ],
      flags: [{ key: "hot-streak", label: "Hot Streak", explanation: "Won the last 5 matches." }],
      matchups: [{
        key: "best-partner",
        label: "Best Partner",
        player: { id: "bea", name: "Bea Rivera" },
        description: "Won 8 of 10 matches together, performing as though rated 126 points higher.",
      }],
    },
    "30d": {
      summary: { rank: 1, rankedPlayerCount: 18, currentRating: 1578, currentRd: 110.01, ratingChange: -3, wins: 1, losses: 1, winRate: 50 },
      ratingHistory: [],
      flags: [],
      matchups: [],
    },
    "90d": {
      summary: { rank: 1, rankedPlayerCount: 18, currentRating: 1578, currentRd: 110.01, ratingChange: 10, wins: 4, losses: 2, winRate: 67 },
      ratingHistory: [], flags: [], matchups: [],
    },
    "1y": {
      summary: { rank: 1, rankedPlayerCount: 18, currentRating: 1578, currentRd: 110.01, ratingChange: 25, wins: 10, losses: 5, winRate: 67 },
      ratingHistory: [], flags: [], matchups: [],
    },
  },
};

describe("PlayerAnalyticsView", () => {
  beforeEach(() => navigation.push.mockReset());

  test("renders the all-period summary and reveals a selected flag explanation", () => {
    render(<PlayerAnalyticsView model={readyModel} />);

    expect(screen.getByRole("heading", { level: 1, name: "Analytics" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Go back" })).toBeNull();
    expect(screen.getByLabelText("Analytics period filter").textContent).toContain("FilterAll30 days90 days1 year");
    expect(screen.queryByRole("heading", { name: "Current Form" })).toBeNull();
    expect(screen.getByRole("region", { name: "Player flags" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Group Dynamics" })).toBeTruthy();
    expect(screen.getByText("Won 8 of 10 matches together, performing as though rated 126 points higher.")).toBeTruthy();
    expect(screen.queryByText("Toughest Competitive Matchup")).toBeNull();

    expect(screen.getByRole("article", { name: "Group Rank" }).textContent).toBe("#1of 18Group Rank");
    expect(screen.getByRole("article", { name: "Win Rate" }).textContent).toBe("64%18–10Win Rate");
    expect(screen.getByRole("article", { name: "Current Rating" }).textContent).toBe("1578?1578, provisional rating+42Current Rating");

    fireEvent.click(screen.getByRole("button", { name: "Hot Streak" }));
    expect(screen.getByText("Won the last 5 matches.")).toBeTruthy();
  });

  test("switches period snapshots locally and exposes empty states", () => {
    render(<PlayerAnalyticsView model={readyModel} />);

    fireEvent.click(screen.getByRole("button", { name: "30 days" }));
    expect(screen.getByRole("article", { name: "Win Rate" }).textContent).toBe("50%1–1Win Rate");
    expect(screen.getByRole("article", { name: "Current Rating" }).textContent).toBe("1578?1578, provisional rating−3Current Rating");
    expect(screen.getByText("No completed matches in this period.")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Player flags" })).toBeNull();
    expect(screen.queryByText("No current-form flags qualify in this period.")).toBeNull();
    expect(screen.getByText("Group dynamics will appear after at least 3 shared matches.")).toBeTruthy();
  });

  test("switches groups by preserving the selected player route", () => {
    render(<PlayerAnalyticsView model={readyModel} />);

    fireEvent.change(screen.getByLabelText("Current group Downtown Rec"), { target: { value: "group-2" } });
    expect(navigation.push).toHaveBeenCalledWith("/groups/group-2/players/alice/analytics");
  });

  test("lets touch and keyboard users select a chart point", () => {
    render(<PlayerAnalyticsView model={readyModel} />);

    const selector = screen.getByLabelText("Inspect rating point");
    const selectedPoint = screen.getByRole("status", { name: "Selected rating point" });
    expect(selectedPoint.textContent)
      .toContain("Aug 1, 2026: rating 1578?, performance range 1493–1663 (±85)");
    expect(selectedPoint.textContent).not.toContain("change");
    expect(selectedPoint.textContent).not.toContain("typical");

    fireEvent.change(selector, { target: { value: "m1" } });

    expect(selectedPoint.textContent)
      .toContain("Jul 20, 2026: rating 1566, performance range 1366–1766 (±200)");
    expect(selectedPoint.textContent).not.toContain("change");
    expect(selectedPoint.textContent).not.toContain("typical");
  });

  test("renders the projection updating state without partial summary cards", () => {
    render(<PlayerAnalyticsView model={{
      status: "updating",
      asOf: readyModel.asOf,
      viewerUserId: readyModel.viewerUserId,
      subject: readyModel.subject,
      group: readyModel.group,
      availableGroups: readyModel.availableGroups,
    }} />);

    expect(screen.getByRole("status").textContent).toContain("Analytics are updating");
    expect(screen.queryByText("Group Rank")).toBeNull();
  });
});
