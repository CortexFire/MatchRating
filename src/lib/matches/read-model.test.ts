import { afterEach, describe, expect, test, vi } from "vitest";
import { buildMatchViews } from "./read-model";

describe("buildMatchViews", () => {
  afterEach(() => vi.useRealTimers());

  test("hydrates ordered teams and games and gives a participant correction access", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T20:00:00.000Z"));
    const [match] = buildMatchViews({
      currentUserId: "opponent",
      currentUserAdminGroupIds: [],
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
      ratingEvents: [{ revision_id: "revision-1", user_id: "submitter", sequence: 1, before_rating: 1500, before_rd: 350, after_rating: 1512, after_rd: 280 }],
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
      correctionStartedAt: "2026-08-07T20:00:00.000Z",
      correctionUntil: "2026-09-06T20:00:00.000Z",
      canCorrect: true,
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

  test("aggregates unordered numeric-string rating events into each player's match change", () => {
    const [match] = buildMatchViews({
      currentUserId: "opponent",
      currentUserAdminGroupIds: [],
      groups: [{ id: "group-1", name: "Wednesday Club" }],
      matches: [{ id: "match-1", group_id: "group-1", active_revision_id: "revision-1", status: "confirmed", submitted_at: "2026-08-07T20:00:00.000Z", review_started_at: "2026-08-07T20:00:00.000Z" }],
      revisions: [{ id: "revision-1", match_id: "match-1", submitted_by_user_id: "submitter", format: "singles" }],
      participants: [
        { revision_id: "revision-1", user_id: "submitter", team: "A", slot: 1 },
        { revision_id: "revision-1", user_id: "opponent", team: "B", slot: 1 },
        { revision_id: "revision-1", user_id: "without-event", team: "B", slot: 2 },
      ],
      games: [{ revision_id: "revision-1", game_number: 1, team_a_score: 21, team_b_score: 18, winner_team: "A" }],
      ratingEvents: [
        { revision_id: "revision-1", user_id: "submitter", sequence: "2", before_rating: "1511.4", before_rd: "200.4", after_rating: "1524.6", after_rd: "140.6" },
        { revision_id: "revision-1", user_id: "submitter", sequence: "1", before_rating: "1499.5", before_rd: "349.6", after_rating: "1511.4", after_rd: "200.4" },
        { revision_id: "revision-1", user_id: "opponent", sequence: "4", before_rating: "1455.6", before_rd: "189.6", after_rating: "1444.4", after_rd: "160.4" },
        { revision_id: "revision-1", user_id: "opponent", sequence: "3", before_rating: "1466.4", before_rd: "220.4", after_rating: "1455.6", after_rd: "189.6" },
      ],
      profiles: [{ id: "submitter", display_name: "Alice" }, { id: "opponent", display_name: "Bea" }, { id: "without-event", display_name: "Cory" }],
    });

    expect(match.teamA[0].ratingChange).toEqual({ previous: { rating: 1500, rd: 350 }, next: { rating: 1525, rd: 141 } });
    expect(match.teamB[0].ratingChange).toEqual({ previous: { rating: 1466, rd: 220 }, next: { rating: 1444, rd: 160 } });
    expect(match.teamB[1].ratingChange).toBeUndefined();
  });

  test("allows participants and group admins to correct but rejects neutral members", () => {
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

    expect(buildMatchViews({ ...shared, currentUserId: "submitter", currentUserAdminGroupIds: [] })[0]).toMatchObject({
      canCorrect: true,
      canRevise: false,
    });
    expect(buildMatchViews({
      ...shared,
      currentUserId: "group-admin",
      currentUserAdminGroupIds: ["group-1"],
    })[0]).toMatchObject({ canCorrect: true, canRevise: false });
    expect(buildMatchViews({
      ...shared,
      currentUserId: "neutral-member",
      currentUserAdminGroupIds: [],
    })[0]).toMatchObject({ canCorrect: false, canRevise: false });
  });

  test("expires disputes at 30 days and reserves legacy revision for disputed matches", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T20:00:00.000Z"));
    const shared = {
      currentUserId: "participant",
      currentUserAdminGroupIds: [],
      groups: [{ id: "group-1", name: "Club" }],
      matches: [{ id: "match-1", group_id: "group-1", active_revision_id: "revision-1", status: "confirmed" as const, submitted_at: "2026-08-07T20:00:00.000Z", review_started_at: "2026-08-07T20:00:00.000Z" }],
      revisions: [{ id: "revision-1", match_id: "match-1", submitted_by_user_id: "participant", format: "singles" as const }],
      participants: [{ revision_id: "revision-1", user_id: "participant", team: "A" as const, slot: 1 }],
      games: [{ revision_id: "revision-1", game_number: 1, team_a_score: 21, team_b_score: 18, winner_team: "A" as const }],
      ratingEvents: [],
      profiles: [{ id: "participant", display_name: "Alice" }],
    };

    expect(buildMatchViews(shared)[0]).toMatchObject({ canCorrect: false, canRevise: false });
    expect(buildMatchViews({
      ...shared,
      matches: [{ ...shared.matches[0], status: "disputed" as const, review_started_at: "2026-08-08T20:00:00.000Z" }],
    })[0]).toMatchObject({ canCorrect: false, canRevise: true });
    expect(buildMatchViews({
      ...shared,
      currentUserId: "group-owner",
      currentUserAdminGroupIds: ["group-1"],
      matches: [{ ...shared.matches[0], status: "disputed" as const, review_started_at: "2026-08-08T20:00:00.000Z" }],
    })[0]).toMatchObject({ canCorrect: false, canRevise: true });
  });
});
