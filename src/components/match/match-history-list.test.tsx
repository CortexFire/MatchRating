// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { MatchHistoryList } from "./match-history-list";

const matches = [
  {
    id: "match-1", groupId: "group-1", groupName: "Club", revisionId: "revision-1", submittedByUserId: "alice",
    status: "pending_confirmation" as const, submittedAt: "2026-08-07T20:00:00.000Z", reviewStartedAt: "2026-08-07T20:00:00.000Z", disputeUntil: "2026-09-06T20:00:00.000Z", format: "singles" as const,
    teamA: [{ id: "alice", name: "Alice Tan", initials: "AT" }], teamB: [{ id: "bea", name: "Bea Rivera", initials: "BR" }],
    games: [{ gameNumber: 1, teamAScore: 21, teamBScore: 18, winnerTeam: "A" as const }], winnerTeam: "A" as const,
    ratingSummary: "2 rating changes", canConfirm: true, canDispute: true, canRevise: false,
  },
  {
    id: "match-2", groupId: "group-1", groupName: "Weekend Club", revisionId: "revision-2", submittedByUserId: "cory",
    status: "disputed" as const, submittedAt: "2026-08-06T20:00:00.000Z", reviewStartedAt: "2026-08-06T20:00:00.000Z", disputeUntil: "2026-09-05T20:00:00.000Z", format: "doubles" as const,
    teamA: [{ id: "cory", name: "Cory Shah", initials: "CS" }], teamB: [{ id: "dev", name: "Dev Okafor", initials: "DO" }],
    games: [{ gameNumber: 1, teamAScore: 17, teamBScore: 21, winnerTeam: "B" as const }], winnerTeam: "B" as const,
    ratingSummary: "Ratings updating…", canConfirm: false, canDispute: false, canRevise: false,
  },
];

describe("MatchHistoryList", () => {
  test("filters stored matches by status and search", () => {
    render(<MatchHistoryList matches={matches} />);
    expect(screen.getByText(/Alice Tan vs Bea Rivera/)).toBeTruthy();
    expect(screen.getByText(/Cory Shah vs Dev Okafor/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Disputed" }));
    expect(screen.queryByText(/Alice Tan vs Bea Rivera/)).toBeNull();
    expect(screen.getByText(/Cory Shah vs Dev Okafor/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.change(screen.getByPlaceholderText("Search matches"), { target: { value: "Bea" } });
    expect(screen.getByText(/Alice Tan vs Bea Rivera/)).toBeTruthy();
    expect(screen.queryByText(/Cory Shah vs Dev Okafor/)).toBeNull();
  });

  test("shows and searches group names in cross-group mode", () => {
    render(<MatchHistoryList matches={matches} showGroupName />);

    expect(screen.getByText("Club")).toBeTruthy();
    expect(screen.getByText("Weekend Club")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Search matches"), { target: { value: "Weekend" } });

    expect(screen.queryByText(/Alice Tan vs Bea Rivera/)).toBeNull();
    expect(screen.getByText(/Cory Shah vs Dev Okafor/)).toBeTruthy();
  });
});
