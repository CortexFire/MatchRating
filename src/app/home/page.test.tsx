import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import HomePage from "./page";

const appDataMocks = vi.hoisted(() => ({
  getCurrentProfile: vi.fn(async () => ({ id: "alice-id", name: "Alice Tan", initials: "AT" })),
  listCurrentUserGroups: vi.fn(async () => [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Wednesday Club Ladder",
      description: "Friendly competitive badminton ladder for weekly club nights.",
      memberCount: 8,
    },
  ]),
  listPendingReviewsForCurrentUser: vi.fn(async () => [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      groupId: "11111111-1111-4111-8111-111111111111",
      groupName: "Wednesday Club Ladder",
      revisionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      submittedByUserId: "bea-id",
      status: "pending_confirmation" as const,
      submittedAt: "2026-08-07T20:00:00.000Z",
      format: "singles" as const,
      teamA: [{ id: "alice-id", name: "Alice Tan", initials: "AT" }],
      teamB: [{ id: "bea-id", name: "Bea Rivera", initials: "BR" }],
      games: [{ gameNumber: 1, teamAScore: 21, teamBScore: 18, winnerTeam: "A" as const }],
      winnerTeam: "A" as const,
      ratingSummary: "2 rating changes",
      canReview: true,
      canRevise: true,
    },
  ]),
}));

vi.mock("@/lib/app-data", () => appDataMocks);

describe("HomePage", () => {
  test("uses the current user's real group for recording", async () => {
    const html = renderToStaticMarkup(await HomePage());

    expect(html).toContain("Alice Tan");
    expect(html).toContain('href="/groups/11111111-1111-4111-8111-111111111111/matches/new"');
    expect(html).not.toContain('href="/groups/new"');
  });

  test("falls back to the groups page when the user has no groups", async () => {
    appDataMocks.listCurrentUserGroups.mockResolvedValueOnce([]);

    const html = renderToStaticMarkup(await HomePage());

    expect(html).toContain('href="/groups"');
    expect(html).not.toContain('/groups/11111111-1111-4111-8111-111111111111/matches/new');
  });

  test("renders real pending reviews with canonical grouped links", async () => {
    const html = renderToStaticMarkup(await HomePage());

    expect(html).toContain("Active match");
    expect(html).toContain("Pending review");
    expect(html).toContain("Resume recording");
    expect(html).toContain("1 waiting");
    expect(html).toContain("Alice def. Bea");
    expect(html).toContain(
      'href="/groups/11111111-1111-4111-8111-111111111111/matches/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"',
    );
  });
});
