// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { type PlayerAnalyticsViewModel } from "@/lib/analytics/analytics-policy";
import { PlayerAnalyticsView } from "./player-analytics-view";

const chartProbe = vi.hoisted(() => ({ loads: 0, pointCount: 0 }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("./rating-history-chart", () => {
  chartProbe.loads += 1;
  return {
    RatingHistoryChart: ({ points }: { points: unknown[] }) => {
      chartProbe.pointCount = points.length;
      return <p>Ready chart probe</p>;
    },
  };
});

const baseModel = {
  asOf: "2026-08-19T12:00:00.000Z",
  viewerUserId: "viewer",
  subject: { id: "player", name: "Player" },
  group: { id: "group", name: "Group" },
  availableGroups: [{ id: "group", name: "Group" }],
};
const emptySnapshot = {
  summary: { rank: 1, rankedPlayerCount: 1, currentRating: 1500, currentRd: 80, ratingChange: 0, wins: 0, losses: 0, winRate: null },
  ratingHistoryPointIds: [],
  ratingHistoryBounds: [0, 1] as [number, number],
  flags: [],
  matchups: [],
};

test("does not load the ready chart module for updating or empty analytics", async () => {
  const updatingModel = { ...baseModel, status: "updating" } as PlayerAnalyticsViewModel;
  const { rerender } = render(<PlayerAnalyticsView model={updatingModel} />);
  await waitFor(() => expect(screen.getByText("Analytics are updating")).toBeTruthy());
  expect(chartProbe.loads).toBe(0);

  rerender(<PlayerAnalyticsView model={{
    ...baseModel,
    status: "ready",
    ratingVersion: "rating-v2",
    historyPoints: {},
    periods: { all: emptySnapshot, "30d": emptySnapshot, "90d": emptySnapshot, "1y": emptySnapshot },
  } as unknown as PlayerAnalyticsViewModel} />);
  expect(screen.getByText("No completed matches in this period.")).toBeTruthy();
  expect(chartProbe.loads).toBe(0);
});

test("passes at most 200 dictionary points to the ready chart", async () => {
  const historyPoints = Object.fromEntries(Array.from({ length: 201 }, (_, index) => {
    const matchId = `match-${index}`;
    return [matchId, {
      matchId,
      occurredAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
      rating: 1500 + index,
      rd: 80,
      performanceSd: 60,
      ratingDelta: 1,
    }];
  }));
  const ids = Object.keys(historyPoints);
  const snapshot = { ...emptySnapshot, ratingHistoryPointIds: ids, ratingHistoryBounds: [1420, 1780] as [number, number] };
  const model = {
    ...baseModel,
    status: "ready",
    ratingVersion: "rating-v2",
    historyPoints,
    periods: { all: snapshot, "30d": snapshot, "90d": snapshot, "1y": snapshot },
  } as unknown as PlayerAnalyticsViewModel;

  render(<PlayerAnalyticsView model={model} />);

  expect(await screen.findByText("Ready chart probe")).toBeTruthy();
  expect(chartProbe.pointCount).toBe(200);
});
