import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { MatchResultConfirmation } from "./match-result-confirmation";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/ratings/glicko2", () => ({
  DEFAULT_RATING: { rating: 1777, rd: 222 },
}));

const match = {
  id: "match-1",
  revisionId: "revision-1",
  status: "pending_confirmation" as const,
  winnerTeam: "A" as const,
  clubName: "Downtown Rec Club",
  submittedAt: "Aug 2nd, 2026 @ 8:53pm",
  correctionUntil: "Sep 1, 2026",
  teamA: {
    label: "Team A",
    players: [
      { id: "alice", initials: "AT", name: "Alice Tan" },
      { id: "cory", initials: "CS", name: "Cory Shah" },
    ],
  },
  teamB: {
    label: "Team B",
    players: [
      { id: "bea", initials: "BR", name: "Bea Rivera" },
      { id: "dev", initials: "DO", name: "Dev Okafor" },
    ],
  },
  sets: [
    { label: "Set 1", teamAScore: 21, teamBScore: 18, winner: "A" as const },
    { label: "Set 2", teamAScore: 13, teamBScore: 21, winner: "B" as const },
    { label: "Set 3", teamAScore: 21, teamBScore: 18, winner: "A" as const },
  ],
};

describe("MatchResultConfirmation", () => {
  test("renders an accepted result with one correction action and no confirmation", () => {
    const html = renderToStaticMarkup(
      <MatchResultConfirmation
        groupId="demo"
        groupName="Downtown Rec"
        canCorrect={true}
        canRevise={false}
        match={{ ...match, status: "confirmed" }}
      />,
    );

    expect(html).toContain("Match Result");
    expect(html).not.toContain("matches to review");
    expect(html).toContain("Downtown Rec");
    expect(html).toContain("Downtown Rec Club");
    expect(html).toContain("Aug 2nd, 2026 @ 8:53pm");
    expect(html).toContain("Team A");
    expect(html).toContain("Team B");
    expect(html).toContain("Set 1");
    expect(html).toContain("Set 2");
    expect(html).toContain("Set 3");
    expect(html).toContain("Accepted");
    expect(html).toContain("Correct result");
    expect(html).toContain("Correct until Sep 1, 2026");
    expect(html).not.toContain(">Confirm<");
    expect(html).not.toContain(">Dispute<");
    expect(html).not.toContain("Awaiting review");
  });

  test("links correction to the prefilled revision route", () => {
    const html = renderToStaticMarkup(
      <MatchResultConfirmation
        groupId="demo"
        groupName="Downtown Rec"
        canCorrect={true}
        canRevise={false}
        match={match}
      />,
    );

    expect(html).toContain(
      'href="/groups/demo/matches/match-1/revise"',
    );
  });

  test("hides correction after the rolling window closes", () => {
    const html = renderToStaticMarkup(
      <MatchResultConfirmation
        groupId="demo"
        groupName="Downtown Rec"
        canCorrect={false}
        canRevise={false}
        match={{ ...match, status: "confirmed" }}
      />,
    );

    expect(html).toContain("Accepted");
    expect(html).not.toContain("Correct until Sep 1, 2026");
    expect(html).not.toContain("Correct result");
  });

  test("shows disputed status and revise link without unavailable review actions", () => {
    const html = renderToStaticMarkup(
      <MatchResultConfirmation
        groupId="demo"
        groupName="Downtown Rec"
        canCorrect={false}
        canRevise={true}
        match={{ ...match, status: "disputed" }}
      />,
    );

    expect(html).toContain("Disputed");
    expect(html).toContain('href="/groups/demo/matches/match-1/revise"');
    expect(html).toContain(">Correct result<");
    expect(html).not.toContain(">Confirm<");
  });

  test("renders compact completed and pending player rating changes without deviations", () => {
    const html = renderToStaticMarkup(
      <MatchResultConfirmation
        groupId="demo"
        groupName="Downtown Rec"
        canCorrect={false}
        canRevise={false}
        match={{
          ...match,
          teamA: { label: "Team A", players: [{ id: "alice", initials: "AT", name: "Alice Tan", ratingChange: { previous: { rating: 1488, rd: 211 }, next: { rating: 1512, rd: 179 } } }] },
          teamB: { label: "Team B", players: [{ id: "bea", initials: "BR", name: "Bea Rivera" }] },
        }}
      />,
    );

    expect(html).toContain("1488 → 1512");
    expect(html).toContain("1777 → …");
    expect(html).not.toContain("Previous");
    expect(html).not.toContain("New 1512");
    expect(html).not.toContain("±");
    expect(html).not.toContain("211");
    expect(html).not.toContain("179");
    expect(html).not.toContain("222");
    expect(html).not.toContain("Updating…");
  });
});
