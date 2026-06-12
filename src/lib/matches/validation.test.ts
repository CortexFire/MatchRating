import { describe, expect, it } from "vitest";
import { validateMatchSubmission } from "./validation";

describe("match validation", () => {
  it("accepts a valid best-of-three doubles submission and derives the winner", () => {
    const result = validateMatchSubmission(
      {
        groupId: "group-1",
        format: "doubles",
        teamAUserIds: ["alice", "cory"],
        teamBUserIds: ["bea", "dev"],
        games: [
          { teamAScore: 21, teamBScore: 17 },
          { teamAScore: 18, teamBScore: 21 },
          { teamAScore: 21, teamBScore: 15 },
        ],
      },
      { activeMemberIds: ["alice", "bea", "cory", "dev"] },
    );

    expect(result.matchWinnerTeam).toBe("A");
    expect(result.teamAGameWins).toBe(2);
    expect(result.teamBGameWins).toBe(1);
  });

  it("rejects duplicate players and tied game scores", () => {
    expect(() =>
      validateMatchSubmission(
        {
          groupId: "group-1",
          format: "doubles",
          teamAUserIds: ["alice", "alice"],
          teamBUserIds: ["bea", "dev"],
          games: [{ teamAScore: 21, teamBScore: 21 }],
        },
        { activeMemberIds: ["alice", "bea", "dev"] },
      ),
    ).toThrow(/duplicate/i);
  });

  it("rejects players who are not active group members", () => {
    expect(() =>
      validateMatchSubmission(
        {
          groupId: "group-1",
          format: "singles",
          teamAUserIds: ["alice"],
          teamBUserIds: ["outsider"],
          games: [{ teamAScore: 21, teamBScore: 15 }],
        },
        { activeMemberIds: ["alice"] },
      ),
    ).toThrow(/active member/i);
  });
});
