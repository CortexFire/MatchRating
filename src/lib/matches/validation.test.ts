import { describe, expect, it } from "vitest";
import { type MatchSubmissionInput, validateMatchSubmission } from "./validation";

describe("match validation", () => {
  it("counts a selected winner when its score conflicts with the selection", () => {
    const result = validateMatchSubmission(
      {
        groupId: "group-1",
        format: "doubles",
        teamAUserIds: ["alice", "cory"],
        teamBUserIds: ["bea", "dev"],
        games: [
          { teamAScore: 21, teamBScore: 17, winnerTeam: "B" },
          { teamAScore: 18, teamBScore: 21, winnerTeam: "B" },
          { teamAScore: 21, teamBScore: 15, winnerTeam: "A" },
        ],
      },
      { activeMemberIds: ["alice", "bea", "cory", "dev"] },
    );

    expect(result.matchWinnerTeam).toBe("B");
    expect(result.teamAGameWins).toBe(1);
    expect(result.teamBGameWins).toBe(2);
  });

  it("rejects duplicate players", () => {
    expect(() =>
      validateMatchSubmission(
        {
          groupId: "group-1",
          format: "doubles",
          teamAUserIds: ["alice", "alice"],
          teamBUserIds: ["bea", "dev"],
          games: [{ teamAScore: 21, teamBScore: 18, winnerTeam: "A" }],
        },
        { activeMemberIds: ["alice", "bea", "dev"] },
      ),
    ).toThrow(/duplicate/i);
  });

  it("rejects a missing or invalid selected game winner", () => {
    const input = {
      groupId: "group-1",
      format: "singles" as const,
      teamAUserIds: ["alice"],
      teamBUserIds: ["bea"],
      games: [{ teamAScore: 21, teamBScore: 18 }],
    };

    expect(() => validateMatchSubmission(input as unknown as MatchSubmissionInput, { activeMemberIds: ["alice", "bea"] })).toThrow();
    expect(() =>
      validateMatchSubmission(
        { ...input, games: [{ ...input.games[0], winnerTeam: "winner" }] } as unknown as MatchSubmissionInput,
        { activeMemberIds: ["alice", "bea"] },
      ),
    ).toThrow();
  });

  it("rejects a tied final score even when a winner is selected", () => {
    expect(() =>
      validateMatchSubmission(
        {
          groupId: "group-1",
          format: "singles",
          teamAUserIds: ["alice"],
          teamBUserIds: ["bea"],
          games: [{ teamAScore: 21, teamBScore: 21, winnerTeam: "A" }],
        },
        { activeMemberIds: ["alice", "bea"] },
      ),
    ).toThrow(/tied scores/i);
  });

  it("rejects players who are not active group members", () => {
    expect(() =>
      validateMatchSubmission(
        {
          groupId: "group-1",
          format: "singles",
          teamAUserIds: ["alice"],
          teamBUserIds: ["outsider"],
          games: [{ teamAScore: 21, teamBScore: 15, winnerTeam: "A" }],
        },
        { activeMemberIds: ["alice"] },
      ),
    ).toThrow(/active member/i);
  });
});
