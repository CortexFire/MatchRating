import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { MatchResultConfirmation } from "./match-result-confirmation";

const match = {
  clubName: "Downtown Rec Club",
  submittedAt: "Aug 2nd, 2026 @ 8:53pm",
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
  test("renders the confirmation screen content and actions", () => {
    const html = renderToStaticMarkup(
      <MatchResultConfirmation
        groupId="demo"
        groupName="Downtown Rec"
        reviewCount={3}
        match={match}
      />,
    );

    expect(html).toContain("Match Result Confirmation");
    expect(html).toContain("3 matches to review");
    expect(html).toContain("Downtown Rec");
    expect(html).toContain("Downtown Rec Club");
    expect(html).toContain("Aug 2nd, 2026 @ 8:53pm");
    expect(html).toContain("Team A");
    expect(html).toContain("Team B");
    expect(html).toContain("Set 1");
    expect(html).toContain("Set 2");
    expect(html).toContain("Set 3");
    expect(html).toContain("Confirm");
    expect(html).toContain("Dispute");
  });

  test("links dispute to a prefilled new match route", () => {
    const html = renderToStaticMarkup(
      <MatchResultConfirmation
        groupId="demo"
        groupName="Downtown Rec"
        reviewCount={3}
        match={match}
      />,
    );

    expect(html).toContain(
      'href="/groups/demo/matches/new?format=doubles&amp;teamA=alice%2Ccory&amp;teamB=bea%2Cdev&amp;scores=21-18%2C13-21%2C21-18"',
    );
  });
});
