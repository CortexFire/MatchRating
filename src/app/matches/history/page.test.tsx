import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import HistoryPage from "./page";

const mocks = vi.hoisted(() => ({
  listCurrentUserGroups: vi.fn(),
  listCurrentUserMatches: vi.fn(),
}));

vi.mock("@/lib/app-data", () => mocks);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listCurrentUserGroups.mockResolvedValue([{
    id: "group-1",
    name: "Wednesday Club",
    description: "",
    memberCount: 8,
  }]);
  mocks.listCurrentUserMatches.mockResolvedValue([{
    id: "match-1",
    groupId: "group-1",
    groupName: "Wednesday Club",
    revisionId: "revision-1",
    submittedByUserId: "alice",
    status: "confirmed",
    submittedAt: "2026-08-07T20:00:00.000Z",
    reviewStartedAt: "2026-08-07T20:00:00.000Z",
    disputeUntil: "2026-09-06T20:00:00.000Z",
    format: "singles",
    teamA: [{ id: "alice", name: "Alice Tan", initials: "AT" }],
    teamB: [{ id: "bea", name: "Bea Rivera", initials: "BR" }],
    games: [{ gameNumber: 1, teamAScore: 21, teamBScore: 18, winnerTeam: "A" }],
    winnerTeam: "A",
    ratingSummary: "2 rating changes",
    canConfirm: false,
    canDispute: true,
    canRevise: false,
  }]);
});

describe("player match history", () => {
  test("renders cross-group matches with participant headings, no accepted pill, and navigation links", async () => {
    const html = renderToStaticMarkup(await HistoryPage());

    expect(html).toContain("Match history");
    expect(html).toContain("Wednesday Club");
    expect(html).toContain("Alice Tan vs Bea Rivera");
    expect(html).not.toContain(">singles<");
    expect(html).not.toContain(">Accepted<");
    expect(html).toContain('href="/groups/group-1/matches/match-1"');
    expect(html).toContain('href="/home"');
    expect(html).toContain('href="/groups/group-1/matches/new"');
  });

  test("renders the history empty state and Record fallback without groups", async () => {
    mocks.listCurrentUserGroups.mockResolvedValueOnce([]);
    mocks.listCurrentUserMatches.mockResolvedValueOnce([]);

    const html = renderToStaticMarkup(await HistoryPage());

    expect(html).toContain("No matches recorded yet.");
    expect(html).toContain('aria-label="Record"');
    expect(html).toContain('href="/groups"');
  });
});
