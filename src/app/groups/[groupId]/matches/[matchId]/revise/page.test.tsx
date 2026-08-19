import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import { ReviseMatchContent } from "./page";

const mocks = vi.hoisted(() => ({
  getGroupMatchDetail: vi.fn(),
  getGroupRatingRebuildStatus: vi.fn(),
  listGroupPlayers: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("@/lib/app-data", () => ({
  getGroupMatchDetail: mocks.getGroupMatchDetail,
  getGroupRatingRebuildStatus: mocks.getGroupRatingRebuildStatus,
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
    status: "pending_confirmation", submittedAt: "2026-08-07T20:00:00.000Z", correctionStartedAt: "2026-08-07T20:00:00.000Z", correctionUntil: "2026-09-06T20:00:00.000Z", format: "singles",
    teamA: [{ id: "alice", name: "Alice Tan", initials: "AT" }], teamB: [{ id: "bea", name: "Bea Rivera", initials: "BR" }],
    games: [{ gameNumber: 1, teamAScore: 21, teamBScore: 18, winnerTeam: "B" }], winnerTeam: "B",
    ratingSummary: "2 rating changes", canCorrect: true, canRevise: false,
  });
  mocks.listGroupPlayers.mockResolvedValue([
    { id: "alice", name: "Alice Tan", initials: "AT", role: "Member", rating: 1500, rd: 350, rank: 1, gamesPlayed: 1, status: "Active" },
    { id: "bea", name: "Bea Rivera", initials: "BR", role: "Member", rating: 1500, rd: 350, rank: 2, gamesPlayed: 1, status: "Active" },
  ]);
  mocks.getGroupRatingRebuildStatus.mockResolvedValue({ id: null, status: null, canRetry: false });
});

test("surfaces a failed rating rebuild on the revision route", async () => {
  mocks.getGroupRatingRebuildStatus.mockResolvedValue({
    id: "44444444-4444-4444-8444-444444444444",
    status: "failed",
    canRetry: false,
  });

  const html = renderToStaticMarkup(await ReviseMatchContent({
    params: Promise.resolve({ groupId: "group-1", matchId: "match-1" }),
  }));

  expect(html).toContain("Match saved, but ratings need attention.");
});

test("prefills the stored revision without an auxiliary text field", async () => {
  const html = renderToStaticMarkup(await ReviseMatchContent({
    params: Promise.resolve({ groupId: "group-1", matchId: "match-1" }),
  }));

  expect(html).toContain("Match Recording");
  expect(html).toContain(">Alice<");
  expect(html).toContain(">Bea<");
  expect(html).not.toContain("textarea");
  expect(html).toContain('aria-pressed="true" aria-label="Mark Set 1 Team B as winner"');
});

test("allows an accepted current participant to open the correction flow", async () => {
  mocks.getGroupMatchDetail.mockResolvedValue({
    ...(await mocks.getGroupMatchDetail()),
    status: "confirmed",
    canCorrect: true,
  });

  const html = renderToStaticMarkup(await ReviseMatchContent({
    params: Promise.resolve({ groupId: "group-1", matchId: "match-1" }),
  }));

  expect(html).toContain("Match Recording");
});

test("does not fetch group players when the match is inaccessible", async () => {
  mocks.getGroupMatchDetail.mockResolvedValue(null);

  await expect(ReviseMatchContent({
    params: Promise.resolve({ groupId: "group-1", matchId: "missing-match" }),
  })).rejects.toThrow("NEXT_NOT_FOUND");
  expect(mocks.listGroupPlayers).not.toHaveBeenCalled();
});
