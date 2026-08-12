import { describe, expect, test } from "vitest";
import { validateActiveMatchDraft } from "./drafts";

const groupId = "11111111-1111-4111-8111-111111111111";
const alice = "22222222-2222-4222-8222-222222222222";
const bea = "33333333-3333-4333-8333-333333333333";

describe("active match drafts", () => {
  test("preserves a selected winner for tied in-progress scores", () => {
    const draft = validateActiveMatchDraft(
      {
        groupId,
        format: "singles",
        teamAUserIds: [alice],
        teamBUserIds: [bea],
        games: [{ teamAScore: 12, teamBScore: 12, winnerTeam: "B" }],
      },
      { activeMemberIds: [alice, bea] },
    );

    expect(draft.games).toEqual([{ teamAScore: 12, teamBScore: 12, winnerTeam: "B" }]);
  });

  test("rejects incomplete and duplicate player drafts", () => {
    expect(() =>
      validateActiveMatchDraft(
        {
          groupId,
          format: "doubles",
          teamAUserIds: [alice],
          teamBUserIds: [bea, alice],
          games: [{ teamAScore: 21, teamBScore: 18, winnerTeam: "A" }],
        },
        { activeMemberIds: [alice, bea] },
      ),
    ).toThrow("doubles drafts require 2 players per team.");
  });
});
