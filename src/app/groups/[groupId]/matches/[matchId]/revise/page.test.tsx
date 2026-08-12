import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import ReviseMatchPage from "./page";

const mocks = vi.hoisted(() => ({
  getGroupMatchDetail: vi.fn(),
  listGroupPlayers: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("@/lib/app-data", () => ({
  getGroupMatchDetail: mocks.getGroupMatchDetail,
  listGroupPlayers: mocks.listGroupPlayers,
}));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getGroupMatchDetail.mockResolvedValue({
    id: "match-1", groupId: "group-1", groupName: "Club", revisionId: "revision-1", submittedByUserId: "alice",
    status: "pending_confirmation", submittedAt: "2026-08-07T20:00:00.000Z", format: "singles",
    teamA: [{ id: "alice", name: "Alice Tan", initials: "AT" }], teamB: [{ id: "bea", name: "Bea Rivera", initials: "BR" }],
    games: [{ gameNumber: 1, teamAScore: 21, teamBScore: 18, winnerTeam: "B" }], winnerTeam: "B",
    ratingSummary: "2 rating changes", canReview: true, canRevise: true,
  });
  mocks.listGroupPlayers.mockResolvedValue([
    { id: "alice", name: "Alice Tan", initials: "AT", role: "Member", rating: 1500, rd: 350, rank: 1, gamesPlayed: 1, status: "Active" },
    { id: "bea", name: "Bea Rivera", initials: "BR", role: "Member", rating: 1500, rd: 350, rank: 2, gamesPlayed: 1, status: "Active" },
  ]);
});

test("prefills the stored revision without an auxiliary text field", async () => {
  const html = renderToStaticMarkup(await ReviseMatchPage({
    params: Promise.resolve({ groupId: "group-1", matchId: "match-1" }),
  }));

  expect(html).toContain("Match Recording");
  expect(html).toContain(">Alice<");
  expect(html).toContain(">Bea<");
  expect(html).not.toContain("textarea");
  expect(html).toContain('aria-pressed="true" aria-label="Mark Set 1 Team B as winner"');
});

test("does not fetch group players when the match is inaccessible", async () => {
  mocks.getGroupMatchDetail.mockResolvedValue(null);

  await expect(ReviseMatchPage({
    params: Promise.resolve({ groupId: "group-1", matchId: "missing-match" }),
  })).rejects.toThrow("NEXT_NOT_FOUND");
  expect(mocks.listGroupPlayers).not.toHaveBeenCalled();
});
