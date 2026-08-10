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
