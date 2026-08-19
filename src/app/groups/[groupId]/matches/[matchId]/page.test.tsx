import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { MatchContent } from "./page";

const appDataMocks = vi.hoisted(() => ({
  getGroupMatchDetail: vi.fn(async () => ({
    id: "match-1", groupId: "group-1", groupName: "Wednesday Club", revisionId: "revision-1", submittedByUserId: "alice",
    status: "confirmed", submittedAt: "2026-08-07T20:00:00.000Z", correctionStartedAt: "2026-08-07T20:00:00.000Z", correctionUntil: "2026-09-06T20:00:00.000Z", format: "singles",
    teamA: [{ id: "alice", name: "Alice Tan", initials: "AT" }], teamB: [{ id: "bea", name: "Bea Rivera", initials: "BR" }],
    games: [{ gameNumber: 1, teamAScore: 21, teamBScore: 18, winnerTeam: "A" }], winnerTeam: "A",
    ratingSummary: "2 rating changes", canCorrect: true, canRevise: false,
  })),
}));

vi.mock("@/lib/app-data", () => ({
  getGroupMatchDetail: appDataMocks.getGroupMatchDetail,
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), useRouter: () => ({ refresh: vi.fn() }) }));

test("renders the stored active revision in the rich detail view", async () => {
  const html = renderToStaticMarkup(await MatchContent({
    params: Promise.resolve({ groupId: "group-1", matchId: "match-1" }),
  }));

  expect(html).toContain("Match Result");
  expect(html).toContain("Alice Tan");
  expect(html).toContain("Bea Rivera");
  expect(html).toContain("Accepted");
  expect(html).toContain("Correct until Sep 6, 2026");
  expect(html).toContain("Correct result");
  expect(html).not.toContain(">Confirm<");
  expect(html).not.toContain("No match details are available yet");
  expect(appDataMocks.getGroupMatchDetail).toHaveBeenCalledWith("group-1", "match-1");
});
