import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { MatchRow } from "@/components/app/match-row";
import { type AppMatchSummary } from "@/lib/app-data";
import { RecentMatchList } from "./recent-match-list";

function match(id: string, status: AppMatchSummary["status"] = "confirmed"): AppMatchSummary {
  return {
    id,
    groupId: "group-1",
    groupName: "Wednesday Club",
    revisionId: `revision-${id}`,
    submittedByUserId: "alice",
    status,
    submittedAt: "2026-08-07T20:00:00.000Z",
    correctionStartedAt: "2026-08-07T20:00:00.000Z",
    correctionUntil: "2026-09-06T20:00:00.000Z",
    format: "singles",
    teamA: [{ id: "alice", name: "Alice Tan", initials: "AT" }],
    teamB: [{ id: "bea", name: "Bea Rivera", initials: "BR" }],
    games: [{ gameNumber: 1, teamAScore: 21, teamBScore: 18, winnerTeam: "A" }],
    winnerTeam: "A",
    ratingSummary: "2 rating changes",
    canCorrect: true,
    canRevise: false,
  };
}

describe("MatchRow", () => {
  test("formats a pending AppMatchSummary without an awaiting-review indicator", () => {
    const html = renderToStaticMarkup(<MatchRow match={match("match-1", "pending_confirmation")} />);

    expect(html).toContain('href="/groups/group-1/matches/match-1"');
    expect(html).not.toContain("Awaiting review");
    expect(html).toContain("Alice Tan vs Bea Rivera");
    expect(html).toContain("21-18");
    expect(html).toContain("Aug 7, 2026, 1:00 PM");
    expect(html).toContain("2 rating changes");
  });
});

describe("RecentMatchList", () => {
  test("omits rating changes, accepted status, and pending indicators while retaining disputes", () => {
    const html = renderToStaticMarkup(
      <RecentMatchList
        matches={[match("confirmed"), match("pending", "pending_confirmation"), match("disputed", "disputed")]}
        historyHref="/groups/group-1/history"
      />,
    );

    expect(html).not.toContain("2 rating changes");
    expect(html).not.toContain("Accepted");
    expect(html).not.toContain("Awaiting review");
    expect(html).toContain("Disputed");
  });

  test("shows at most five match links and a View all link", () => {
    const html = renderToStaticMarkup(
      <RecentMatchList matches={Array.from({ length: 6 }, (_, index) => match(`match-${index + 1}`))} historyHref="/groups/group-1/history" />,
    );

    expect((html.match(/href="\/groups\/group-1\/matches\//g) ?? [])).toHaveLength(5);
    expect(html).not.toContain("match-6");
    expect(html).toContain('href="/groups/group-1/history"');
    expect(html).toContain("View all");
  });

  test("shows the exact empty state without View all", () => {
    const html = renderToStaticMarkup(<RecentMatchList matches={[]} historyHref="/groups/group-1/history" />);

    expect(html).toContain("No matches recorded yet.");
    expect(html).not.toContain("View all");
  });

});
