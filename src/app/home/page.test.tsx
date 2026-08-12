import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import HomePage from "./page";

const appDataMocks = vi.hoisted(() => ({
  getCurrentProfile: vi.fn(async () => ({ id: "alice-id", name: "Alice Tan", initials: "AT" })),
  listCurrentUserActiveMatchDrafts: vi.fn(async () => [
    {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      groupId: "11111111-1111-4111-8111-111111111111",
      groupName: "Wednesday Club Ladder",
      format: "singles" as const,
      teamA: ["Alice Tan"],
      teamB: ["Bea Rivera"],
      scores: ["21-19"],
      role: "Creator" as const,
    },
    {
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      groupId: "22222222-2222-4222-8222-222222222222",
      groupName: "Older Draft Club",
      format: "doubles" as const,
      teamA: ["Older A1", "Older A2"],
      teamB: ["Older B1", "Older B2"],
      scores: ["11-8"],
      role: "Participant" as const,
    },
  ]),
  listCurrentUserGroups: vi.fn(async () => [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Wednesday Club Ladder",
      description: "Friendly competitive badminton ladder for weekly club nights.",
      memberCount: 8,
    },
  ]),
  listCurrentUserMatches: vi.fn(async () => [
    {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      groupId: "22222222-2222-4222-8222-222222222222",
      groupName: "Weekend Club",
      revisionId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      submittedByUserId: "alice-id",
      status: "confirmed" as const,
      submittedAt: "2026-08-08T20:00:00.000Z",
      reviewStartedAt: "2026-08-08T20:00:00.000Z",
      disputeUntil: "2026-09-07T20:00:00.000Z",
      format: "singles" as const,
      teamA: [{ id: "alice-id", name: "Alice Tan", initials: "AT" }],
      teamB: [{ id: "cory-id", name: "Cory Shah", initials: "CS" }],
      games: [{ gameNumber: 1, teamAScore: 21, teamBScore: 16, winnerTeam: "A" as const }],
      winnerTeam: "A" as const,
      ratingSummary: "2 rating changes",
      canConfirm: false,
      canDispute: true,
      canRevise: false,
    },
  ]),
  listCurrentUserRankings: vi.fn(async () => [
    {
      groupId: "11111111-1111-4111-8111-111111111111",
      groupName: "Wednesday Club Ladder",
      rating: 1642,
      rank: 4,
      memberCount: 8,
    },
  ]),
}));

vi.mock("@/lib/app-data", () => appDataMocks);

describe("HomePage", () => {
  test("resumes the newest real active draft with its canonical grouped link", async () => {
    const html = renderToStaticMarkup(await HomePage());

    expect(html).toContain("Alice Tan");
    expect(html).toContain("Alice Tan vs Bea Rivera");
    expect(html).toContain("21-19");
    expect(html).toContain(
      'href="/groups/11111111-1111-4111-8111-111111111111/matches/new?draftId=dddddddd-dddd-4ddd-8ddd-dddddddddddd"',
    );
    expect(html).not.toContain("Older Draft Club");
    expect(html).not.toContain('href="/groups/new"');
    expect(appDataMocks.listCurrentUserActiveMatchDrafts).toHaveBeenCalledOnce();
  });

  test("falls back to the groups page when the user has no groups", async () => {
    appDataMocks.listCurrentUserGroups.mockResolvedValueOnce([]);
    appDataMocks.listCurrentUserActiveMatchDrafts.mockResolvedValueOnce([]);

    const html = renderToStaticMarkup(await HomePage());

    expect(html).toContain('href="/groups"');
    expect(html).not.toContain('/groups/11111111-1111-4111-8111-111111111111/matches/new');
  });

  test("renders the create-match empty state when there is no active draft", async () => {
    appDataMocks.listCurrentUserActiveMatchDrafts.mockResolvedValueOnce([]);

    const html = renderToStaticMarkup(await HomePage());

    expect(html).toContain("No active match in progress");
    expect(html).toContain("Create a match");
    expect(html).toContain('href="/groups/11111111-1111-4111-8111-111111111111/matches/new"');
    expect(html).not.toContain("Resume recording");
  });

  test("renders the three latest matches as result cards without rating summaries", async () => {
    const html = renderToStaticMarkup(await HomePage());

    const activeIndex = html.indexOf("Active match");
    const latestIndex = html.indexOf("Latest matches");
    const rankingsIndex = html.indexOf("Current rankings");
    expect(activeIndex).toBeGreaterThan(-1);
    expect(latestIndex).toBeGreaterThan(activeIndex);
    expect(rankingsIndex).toBeGreaterThan(latestIndex);
    expect(html).not.toContain("Pending review");
    expect(html).toContain("Alice def. Cory");
    expect(html).toContain("Aug 8, 2026, 1:00 PM");
    expect(html).toContain("Weekend Club");
    expect(html).toContain("21 - 16");
    expect(html).not.toContain("1 - 0");
    expect(html).toContain("Singles");
    expect(html).not.toContain("2 rating changes");
    expect(html).toContain("Weekend Club");
    expect(html).toContain('href="/matches/history"');
    expect(html).toContain("min-h-11");
    expect(html).toContain("focus-visible:outline-action");
    expect(html).toContain('href="/groups/11111111-1111-4111-8111-111111111111/rankings"');
    expect(html).toContain("#4 of 8");
    expect(html).toContain("1642");
    expect(appDataMocks.listCurrentUserMatches).toHaveBeenCalledWith({ limit: 3 });
  });

  test("renders no more than three latest result cards when the data source returns extra matches", async () => {
    const [latestMatch] = await appDataMocks.listCurrentUserMatches();
    appDataMocks.listCurrentUserMatches.mockClear();
    appDataMocks.listCurrentUserMatches.mockResolvedValueOnce(
      Array.from({ length: 4 }, (_, index) => ({
        ...latestMatch,
        id: `latest-match-${index + 1}`,
      })),
    );

    const html = renderToStaticMarkup(await HomePage());

    expect((html.match(/href="\/groups\/22222222-2222-4222-8222-222222222222\/matches\/latest-match-/g) ?? [])).toHaveLength(3);
    expect(html).not.toContain('href="/groups/22222222-2222-4222-8222-222222222222/matches/latest-match-4"');
  });

  test("renders empty states for players without matches or rankings", async () => {
    appDataMocks.listCurrentUserMatches.mockResolvedValueOnce([]);
    appDataMocks.listCurrentUserRankings.mockResolvedValueOnce([]);

    const html = renderToStaticMarkup(await HomePage());

    expect(html).toContain("No matches recorded yet.");
    expect(html).toContain("Join a group to see your rankings.");
    expect(html).not.toContain('href="/matches/history"');
  });
});
