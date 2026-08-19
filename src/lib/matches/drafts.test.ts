import { describe, expect, test } from "vitest";
import { isEmptyActiveMatchDraft, validateActiveMatchDraft } from "./drafts";

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

  test("rejects drafts with a missing game winner", () => {
    expect(() =>
      validateActiveMatchDraft({
        groupId,
        format: "singles",
        teamAUserIds: [alice],
        teamBUserIds: [bea],
        games: [{ teamAScore: 12, teamBScore: 12 }],
      } as unknown as Parameters<typeof validateActiveMatchDraft>[0]),
    ).toThrow(/winnerTeam/);
  });

  test("rejects drafts with an invalid game winner", () => {
    expect(() =>
      validateActiveMatchDraft({
        groupId,
        format: "singles",
        teamAUserIds: [alice],
        teamBUserIds: [bea],
        games: [{ teamAScore: 12, teamBScore: 12, winnerTeam: "C" }],
      } as unknown as Parameters<typeof validateActiveMatchDraft>[0]),
    ).toThrow(/winnerTeam/);
  });

  test("accepts partial teams and one-sided scores", () => {
    const draft = validateActiveMatchDraft(
      {
        groupId,
        format: "doubles",
        teamAUserIds: [alice],
        teamBUserIds: [],
        games: [{ teamAScore: 21, teamBScore: null, winnerTeam: "A" }],
      },
      { activeMemberIds: [alice, bea] },
    );

    expect(draft).toEqual({
      groupId,
      format: "doubles",
      teamAUserIds: [alice],
      teamBUserIds: [],
      games: [{ teamAScore: 21, teamBScore: null, winnerTeam: "A" }],
    });
  });

  test("rejects oversized and duplicate player teams", () => {
    expect(() =>
      validateActiveMatchDraft(
        {
          groupId,
          format: "singles",
          teamAUserIds: [alice, bea],
          teamBUserIds: [],
          games: [{ teamAScore: 21, teamBScore: 18, winnerTeam: "A" }],
        },
        { activeMemberIds: [alice, bea] },
      ),
    ).toThrow("singles drafts allow at most 1 player per team.");

    expect(() =>
      validateActiveMatchDraft(
        {
          groupId,
          format: "doubles",
          teamAUserIds: [alice],
          teamBUserIds: [alice],
          games: [{ teamAScore: null, teamBScore: null, winnerTeam: "A" }],
        },
        { activeMemberIds: [alice, bea] },
      ),
    ).toThrow("A draft cannot contain duplicate players.");
  });

  test("classifies a draft as empty only when players and score values are absent", () => {
    expect(isEmptyActiveMatchDraft({
      groupId,
      format: "singles",
      teamAUserIds: [],
      teamBUserIds: [],
      games: [{ teamAScore: null, teamBScore: null, winnerTeam: "B" }],
    })).toBe(true);

    expect(isEmptyActiveMatchDraft({
      groupId,
      format: "singles",
      teamAUserIds: [alice],
      teamBUserIds: [],
      games: [{ teamAScore: null, teamBScore: null, winnerTeam: "A" }],
    })).toBe(false);

    expect(isEmptyActiveMatchDraft({
      groupId,
      format: "singles",
      teamAUserIds: [],
      teamBUserIds: [],
      games: [{ teamAScore: 0, teamBScore: null, winnerTeam: "A" }],
    })).toBe(false);
  });
});
