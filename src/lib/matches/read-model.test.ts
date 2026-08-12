import { afterEach, describe, expect, test, vi } from "vitest";
import { buildMatchViews } from "./read-model";

describe("buildMatchViews", () => {
  afterEach(() => vi.useRealTimers());

  test("hydrates ordered teams and games and identifies an eligible opposing reviewer", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T20:00:00.000Z"));
    const [match] = buildMatchViews({
      currentUserId: "opponent",
      groups: [{ id: "group-1", name: "Wednesday Club" }],
      matches: [{
        id: "match-1",
        group_id: "group-1",
        active_revision_id: "revision-1",
        status: "pending_confirmation",
        submitted_at: "2026-08-07T20:00:00.000Z",
        review_started_at: "2026-08-07T20:00:00.000Z",
      }],
      revisions: [{
        id: "revision-1",
        match_id: "match-1",
        submitted_by_user_id: "submitter",
        format: "doubles",
      }],
      participants: [
        { revision_id: "revision-1", user_id: "partner", team: "A", slot: 2 },
        { revision_id: "revision-1", user_id: "opponent", team: "B", slot: 1 },
        { revision_id: "revision-1", user_id: "submitter", team: "A", slot: 1 },
        { revision_id: "revision-1", user_id: "opponent-partner", team: "B", slot: 2 },
      ],
      games: [
        { revision_id: "revision-1", game_number: 2, team_a_score: 18, team_b_score: 21, winner_team: "B" },
        { revision_id: "revision-1", game_number: 1, team_a_score: 21, team_b_score: 17, winner_team: "A" },
        { revision_id: "revision-1", game_number: 3, team_a_score: 21, team_b_score: 16, winner_team: "A" },
      ],
      confirmations: [],
      ratingEvents: [{ revision_id: "revision-1", user_id: "submitter", before_rating: 1500, after_rating: 1512 }],
      profiles: [
        { id: "submitter", display_name: "Alice Tan" },
        { id: "partner", display_name: "Cory Shah" },
        { id: "opponent", display_name: "Bea Rivera" },
        { id: "opponent-partner", display_name: "Dev Okafor" },
      ],
    });

    expect(match).toMatchObject({
      id: "match-1",
      groupName: "Wednesday Club",
      revisionId: "revision-1",
      winnerTeam: "A",
      reviewStartedAt: "2026-08-07T20:00:00.000Z",
      disputeUntil: "2026-09-06T20:00:00.000Z",
      canConfirm: true,
      canDispute: true,
      canRevise: false,
      ratingSummary: "1 rating change",
      teamA: [{ id: "submitter", name: "Alice Tan" }, { id: "partner", name: "Cory Shah" }],
      teamB: [{ id: "opponent", name: "Bea Rivera" }, { id: "opponent-partner", name: "Dev Okafor" }],
      games: [
        { gameNumber: 1, teamAScore: 21, teamBScore: 17, winnerTeam: "A" },
        { gameNumber: 2, teamAScore: 18, teamBScore: 21, winnerTeam: "B" },
        { gameNumber: 3, teamAScore: 21, teamBScore: 16, winnerTeam: "A" },
      ],
    });
  });

  test("derives confirmation and rolling dispute permissions independently", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T20:00:00.000Z"));
    const shared = {
      groups: [{ id: "group-1", name: "Wednesday Club" }],
      matches: [{ id: "match-1", group_id: "group-1", active_revision_id: "revision-1", status: "pending_confirmation" as const, submitted_at: "2026-08-07T20:00:00.000Z", review_started_at: "2026-08-07T20:00:00.000Z" }],
      revisions: [{ id: "revision-1", match_id: "match-1", submitted_by_user_id: "submitter", format: "singles" as const }],
      participants: [
        { revision_id: "revision-1", user_id: "submitter", team: "A" as const, slot: 1 },
        { revision_id: "revision-1", user_id: "opponent", team: "B" as const, slot: 1 },
      ],
      games: [{ revision_id: "revision-1", game_number: 1, team_a_score: 21, team_b_score: 18, winner_team: "A" as const }],
      ratingEvents: [],
      profiles: [{ id: "submitter", display_name: "Alice" }, { id: "opponent", display_name: "Bea" }],
    };

    expect(buildMatchViews({ ...shared, currentUserId: "submitter", confirmations: [] })[0]).toMatchObject({
      canConfirm: false,
      canDispute: true,
      canRevise: false,
    });
    expect(buildMatchViews({
      ...shared,
      currentUserId: "opponent",
      confirmations: [{ revision_id: "revision-1", user_id: "opponent", action: "confirmed", created_at: "2026-08-07T20:05:00.000Z" }],
    })[0]).toMatchObject({ canConfirm: false, canDispute: true });
  });

  test("expires disputes at 30 days and reserves legacy revision for disputed matches", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T20:00:00.000Z"));
    const shared = {
      currentUserId: "participant",
      groups: [{ id: "group-1", name: "Club" }],
      matches: [{ id: "match-1", group_id: "group-1", active_revision_id: "revision-1", status: "confirmed" as const, submitted_at: "2026-08-07T20:00:00.000Z", review_started_at: "2026-08-07T20:00:00.000Z" }],
      revisions: [{ id: "revision-1", match_id: "match-1", submitted_by_user_id: "participant", format: "singles" as const }],
      participants: [{ revision_id: "revision-1", user_id: "participant", team: "A" as const, slot: 1 }],
      games: [{ revision_id: "revision-1", game_number: 1, team_a_score: 21, team_b_score: 18, winner_team: "A" as const }],
      confirmations: [],
      ratingEvents: [],
      profiles: [{ id: "participant", display_name: "Alice" }],
    };

    expect(buildMatchViews(shared)[0]).toMatchObject({ canDispute: false, canRevise: false });
    expect(buildMatchViews({
      ...shared,
      matches: [{ ...shared.matches[0], status: "disputed" as const, review_started_at: "2026-08-08T20:00:00.000Z" }],
    })[0]).toMatchObject({ canConfirm: false, canDispute: false, canRevise: true });
  });
});
