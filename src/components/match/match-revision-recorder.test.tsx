// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { MatchRevisionRecorder } from "./match-revision-recorder";

const actionMocks = vi.hoisted(() => ({ disputeAndReviseMatch: vi.fn(), reviseMatch: vi.fn() }));
const navigationMocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("@/app/actions", () => actionMocks);
vi.mock("next/navigation", () => ({ useRouter: () => navigationMocks }));

const players = [
  { id: "alice", name: "Alice Tan", initials: "AT", role: "Member" as const, rating: 1500, rd: 350, rank: 1, gamesPlayed: 1, status: "Active" as const },
  { id: "bea", name: "Bea Rivera", initials: "BR", role: "Member" as const, rating: 1500, rd: 350, rank: 2, gamesPlayed: 1, status: "Active" as const },
];

test("submits a pending correction through the atomic action without free-text metadata", async () => {
  actionMocks.disputeAndReviseMatch.mockResolvedValue({
    ok: true,
    data: { matchId: "match-1", revisionId: "revision-2", ratingJobId: "job-1", ratingStatus: "queued" },
  });
  render(
    <MatchRevisionRecorder
      groupId="group-1"
      groupName="Club"
      matchId="match-1"
      expectedRevisionId="revision-1"
      mode="dispute"
      players={players}
      initialMatch={{ format: "singles", teamAUserIds: ["alice"], teamBUserIds: ["bea"], games: [{ teamAScore: 21, teamBScore: 18 }] }}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Submit" }));

  await waitFor(() => expect(actionMocks.disputeAndReviseMatch).toHaveBeenCalledWith({
    commandId: expect.any(String),
    groupId: "group-1",
    matchId: "match-1",
    expectedRevisionId: "revision-1",
    format: "singles",
    teamAUserIds: ["alice"],
    teamBUserIds: ["bea"],
    games: [{ teamAScore: 21, teamBScore: 18 }],
  }));
  expect(navigationMocks.push).toHaveBeenCalledWith("/groups/group-1/matches/match-1");
  expect(screen.queryByRole("textbox")).toBeNull();
});
