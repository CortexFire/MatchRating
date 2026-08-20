import { describe, expect, it } from "vitest";
import {
  DEFAULT_RATING,
  rebuildGroupRatingsFromMatches,
  updateDoublesGame,
  updateRatingPeriod,
  type RatingState,
} from "./glicko2";
import { toRatingProjection } from "./projection";

describe("Glicko-2 rating engine", () => {
  it("matches Mark Glickman's published reference example", () => {
    const player: RatingState = {
      rating: 1500,
      rd: 200,
      volatility: 0.06,
      gamesPlayed: 0,
    };

    const updated = updateRatingPeriod(player, [
      { opponent: { ...DEFAULT_RATING, rating: 1400, rd: 30 }, score: 1 },
      { opponent: { ...DEFAULT_RATING, rating: 1550, rd: 100 }, score: 0 },
      { opponent: { ...DEFAULT_RATING, rating: 1700, rd: 300 }, score: 0 },
    ]);

    expect(updated.rating).toBeCloseTo(1464.06, 1);
    expect(updated.rd).toBeCloseTo(151.52, 2);
    expect(updated.volatility).toBeCloseTo(0.05999, 4);
    expect(updated.gamesPlayed).toBe(3);
  });

  it("rewards a doubles win more when the player's partner is weaker", () => {
    const target = { ...DEFAULT_RATING, rating: 1500, rd: 80 };
    const strongPartner = { ...DEFAULT_RATING, rating: 1800, rd: 80 };
    const weakPartner = { ...DEFAULT_RATING, rating: 1200, rd: 80 };
    const opponentA = { ...DEFAULT_RATING, rating: 1500, rd: 80 };
    const opponentB = { ...DEFAULT_RATING, rating: 1500, rd: 80 };

    const withStrongPartner = updateDoublesGame(
      [target, strongPartner],
      [opponentA, opponentB],
      "A",
    ).teamA[0];
    const withWeakPartner = updateDoublesGame(
      [target, weakPartner],
      [opponentA, opponentB],
      "A",
    ).teamA[0];

    expect(withWeakPartner.rating - target.rating).toBeGreaterThan(
      withStrongPartner.rating - target.rating,
    );
  });

  it("uses the selected Team B winner when a historical score favors Team A", () => {
    const rebuilt = rebuildGroupRatingsFromMatches([
      {
        id: "m-score-conflict",
        revisionId: "r-score-conflict",
        submittedAt: "2026-01-01T00:00:00.000Z",
        format: "singles",
        teamAUserIds: ["alice"],
        teamBUserIds: ["bea"],
        games: [{ gameId: "g-score-conflict", gameNumber: 1, teamAScore: 21, teamBScore: 18, winnerTeam: "B" }],
      },
    ]);

    expect(rebuilt.ratings.get("alice")?.rating).toBeLessThan(DEFAULT_RATING.rating);
    expect(rebuilt.ratings.get("bea")?.rating).toBeGreaterThan(DEFAULT_RATING.rating);
    expect(rebuilt.events.map(({ userId, actualScore }) => ({ userId, actualScore }))).toEqual([
      { userId: "alice", actualScore: 0 },
      { userId: "bea", actualScore: 1 },
    ]);
  });

  it("rebuilds isolated group ratings from active match history", () => {
    const rebuilt = rebuildGroupRatingsFromMatches([
      {
        id: "m1",
        revisionId: "r1",
        submittedAt: "2026-01-01T00:00:00.000Z",
        format: "singles",
        teamAUserIds: ["alice"],
        teamBUserIds: ["bea"],
        games: [{ gameId: "g1", gameNumber: 1, teamAScore: 21, teamBScore: 18, winnerTeam: "A" }],
      },
      {
        id: "m2",
        revisionId: "r2",
        submittedAt: "2026-01-02T00:00:00.000Z",
        format: "doubles",
        teamAUserIds: ["alice", "cory"],
        teamBUserIds: ["bea", "dev"],
        games: [
          { gameId: "g2", gameNumber: 1, teamAScore: 19, teamBScore: 21, winnerTeam: "B" },
          { gameId: "g3", gameNumber: 2, teamAScore: 21, teamBScore: 17, winnerTeam: "A" },
          { gameId: "g4", gameNumber: 3, teamAScore: 21, teamBScore: 15, winnerTeam: "A" },
        ],
      },
    ]);

    expect(rebuilt.ratings.get("alice")?.gamesPlayed).toBe(4);
    expect(rebuilt.ratings.get("dev")?.gamesPlayed).toBe(3);
    expect(rebuilt.events).toHaveLength(14);
    expect(rebuilt.events[0]).toMatchObject({
      matchId: "m1",
      revisionId: "r1",
      userId: "alice",
      sequence: 1,
    });
  });

  it("continues event sequences after a preserved prefix", () => {
    const rebuilt = rebuildGroupRatingsFromMatches(
      [
        {
          id: "m2",
          revisionId: "r2",
          submittedAt: "2026-01-02T00:00:00.000Z",
          format: "singles",
          teamAUserIds: ["alice"],
          teamBUserIds: ["bea"],
          games: [{ gameId: "g2", gameNumber: 1, teamAScore: 21, teamBScore: 18, winnerTeam: "A" }],
        },
      ],
      new Map([
        ["alice", { ...DEFAULT_RATING, rating: 1510, gamesPlayed: 3 }],
        ["bea", { ...DEFAULT_RATING, rating: 1490, gamesPlayed: 3 }],
      ]),
      6,
    );

    expect(rebuilt.events.map((event) => event.sequence)).toEqual([7, 8]);
    expect(rebuilt.ratings.get("alice")?.gamesPlayed).toBe(4);
    expect(rebuilt.ratings.get("bea")?.gamesPlayed).toBe(4);
  });

  it("produces the same projection when replaying from a seeded suffix", () => {
    const history = [
      {
        id: "m1",
        revisionId: "r1",
        submittedAt: "2026-01-01T00:00:00.000Z",
        format: "singles" as const,
        teamAUserIds: ["alice"],
        teamBUserIds: ["bea"],
        games: [{ gameId: "g1", gameNumber: 1, teamAScore: 21, teamBScore: 18, winnerTeam: "A" as const }],
      },
      {
        id: "m2",
        revisionId: "r2",
        submittedAt: "2026-01-02T00:00:00.000Z",
        format: "doubles" as const,
        teamAUserIds: ["alice", "cory"],
        teamBUserIds: ["bea", "dev"],
        games: [
          { gameId: "g2", gameNumber: 1, teamAScore: 18, teamBScore: 21, winnerTeam: "B" as const },
          { gameId: "g3", gameNumber: 2, teamAScore: 21, teamBScore: 16, winnerTeam: "A" as const },
          { gameId: "g4", gameNumber: 3, teamAScore: 21, teamBScore: 17, winnerTeam: "A" as const },
        ],
      },
      {
        id: "m3",
        revisionId: "r3",
        submittedAt: "2026-01-03T00:00:00.000Z",
        format: "singles" as const,
        teamAUserIds: ["erin"],
        teamBUserIds: ["alice"],
        games: [{ gameId: "g5", gameNumber: 1, teamAScore: 19, teamBScore: 21, winnerTeam: "B" as const }],
      },
    ];
    const full = rebuildGroupRatingsFromMatches(history);
    const prefix = rebuildGroupRatingsFromMatches(history.slice(0, 1));
    const suffix = rebuildGroupRatingsFromMatches(
      history.slice(1),
      prefix.ratings,
      prefix.events.length,
    );

    expect(Array.from(suffix.ratings.entries())).toEqual(Array.from(full.ratings.entries()));
    expect([...prefix.events, ...suffix.events]).toEqual(full.events);
    expect(
      toRatingProjection(suffix.ratings, [...prefix.events, ...suffix.events]),
    ).toEqual(toRatingProjection(full.ratings, full.events));
  });

  it("emits canonical singles facts from the expectation used by each rating update", () => {
    const occurredAt = "2026-02-01T10:00:00.000Z";
    const rebuilt = rebuildGroupRatingsFromMatches([
      {
        id: "m-facts",
        revisionId: "r-facts",
        submittedAt: occurredAt,
        format: "singles",
        teamAUserIds: ["alice"],
        teamBUserIds: ["bea"],
        games: [{ gameId: "g-facts", gameNumber: 1, teamAScore: 21, teamBScore: 17, winnerTeam: "A" }],
      },
    ]);

    expect(rebuilt.events).toEqual([
      {
        matchId: "m-facts",
        revisionId: "r-facts",
        gameId: "g-facts",
        gameNumber: 1,
        occurredAt,
        format: "singles",
        team: "A",
        userId: "alice",
        sequence: 1,
        expectedScore: 0.5,
        actualScore: 1,
        pointsFor: 21,
        pointsAgainst: 17,
        before: { rating: 1500, rd: 350, volatility: 0.06, gamesPlayed: 0 },
        after: { rating: 1662.310894, rd: 290.318964, volatility: 0.05999968, gamesPlayed: 1 },
      },
      {
        matchId: "m-facts",
        revisionId: "r-facts",
        gameId: "g-facts",
        gameNumber: 1,
        occurredAt,
        format: "singles",
        team: "B",
        userId: "bea",
        sequence: 2,
        expectedScore: 0.5,
        actualScore: 0,
        pointsFor: 17,
        pointsAgainst: 21,
        before: { rating: 1500, rd: 350, volatility: 0.06, gamesPlayed: 0 },
        after: { rating: 1337.689106, rd: 290.318964, volatility: 0.05999968, gamesPlayed: 1 },
      },
    ]);
  });

  it("shares one complementary expectation per doubles team", () => {
    const seeded = new Map<string, RatingState>([
      ["alice", { ...DEFAULT_RATING, rating: 1650, rd: 80 }],
      ["cory", { ...DEFAULT_RATING, rating: 1550, rd: 90 }],
      ["bea", { ...DEFAULT_RATING, rating: 1400, rd: 100 }],
      ["dev", { ...DEFAULT_RATING, rating: 1350, rd: 110 }],
    ]);
    const rebuilt = rebuildGroupRatingsFromMatches([
      {
        id: "m-doubles-facts",
        revisionId: "r-doubles-facts",
        submittedAt: "2026-02-02T10:00:00.000Z",
        format: "doubles",
        teamAUserIds: ["alice", "cory"],
        teamBUserIds: ["bea", "dev"],
        games: [{ gameId: "g-doubles-facts", gameNumber: 1, teamAScore: 19, teamBScore: 21, winnerTeam: "B" }],
      },
    ], seeded);

    const [alice, cory, bea, dev] = rebuilt.events;
    expect(alice.expectedScore).toBe(cory.expectedScore);
    expect(bea.expectedScore).toBe(dev.expectedScore);
    expect(alice.expectedScore + bea.expectedScore).toBeCloseTo(1, 12);
    expect([alice.actualScore, cory.actualScore, bea.actualScore, dev.actualScore]).toEqual([0, 0, 1, 1]);
    expect([alice.pointsFor, alice.pointsAgainst, bea.pointsFor, bea.pointsAgainst]).toEqual([19, 21, 21, 19]);
  });

  it("updates consistency once per match from ratings snapshotted before the first game", () => {
    const rebuilt = rebuildGroupRatingsFromMatches(
      [{
        id: "m-best-of-three",
        revisionId: "r-best-of-three",
        submittedAt: "2026-02-03T10:00:00.000Z",
        format: "singles",
        teamAUserIds: ["alice"],
        teamBUserIds: ["bea"],
        games: [
          { gameId: "g-1", gameNumber: 1, teamAScore: 21, teamBScore: 10, winnerTeam: "A" },
          { gameId: "g-2", gameNumber: 2, teamAScore: 18, teamBScore: 21, winnerTeam: "B" },
          { gameId: "g-3", gameNumber: 3, teamAScore: 21, teamBScore: 17, winnerTeam: "A" },
        ],
      }],
      new Map([
        ["alice", { ...DEFAULT_RATING, rating: 1700, rd: 80 }],
        ["bea", { ...DEFAULT_RATING, rating: 1500, rd: 80 }],
      ]),
      0,
      new Map(),
      12,
    );

    expect(rebuilt.events).toHaveLength(6);
    expect(rebuilt.consistencyEvents).toHaveLength(2);
    expect(rebuilt.consistencyEvents.map((event) => ({
      userId: event.userId,
      sequence: event.sequence,
      actualScore: event.actualScore,
    }))).toEqual([
      { userId: "alice", sequence: 13, actualScore: 1 },
      { userId: "bea", sequence: 14, actualScore: 0 },
    ]);
    expect(rebuilt.consistencyEvents[0].expectedScore).toBeCloseTo(0.7602499389, 7);
    expect(rebuilt.consistencyEvents[1].expectedScore).toBeCloseTo(0.2397500611, 7);
    expect(rebuilt.consistencyStates.get("alice")?.matchesPlayed).toBe(1);
    expect(rebuilt.consistencyStates.get("bea")?.matchesPlayed).toBe(1);
  });

  it("uses an optional final consistency config for missing states and match updates", () => {
    const config = { populationKappa: 120, priorLogSd: 0.2, driftLogSd: 0 };
    const rebuilt = rebuildGroupRatingsFromMatches(
      [{
        id: "m-calibrated",
        revisionId: "r-calibrated",
        submittedAt: "2026-02-04T10:00:00.000Z",
        format: "singles",
        teamAUserIds: ["alice"],
        teamBUserIds: ["bea"],
        games: [{ gameId: "g-calibrated", gameNumber: 1, teamAScore: 21, teamBScore: 17, winnerTeam: "A" }],
      }],
      new Map([
        ["alice", { ...DEFAULT_RATING, rating: 1650, rd: 80 }],
        ["bea", { ...DEFAULT_RATING, rating: 1500, rd: 80 }],
      ]),
      0,
      new Map(),
      0,
      config,
    );

    expect(rebuilt.consistencyEvents[0].before.logKappaMean).toBe(Math.log(120));
    expect(rebuilt.consistencyEvents[0].before.logKappaVariance).toBeCloseTo(0.04, 12);
    expect(rebuilt.consistencyEvents[0].before.matchesPlayed).toBe(0);
    expect(rebuilt.consistencyEvents[0].expectedScore).toBeGreaterThan(0.8);
  });

  it("replays a seeded suffix identically for both event streams without mutating seeds", () => {
    const history = [
      {
        id: "m1",
        revisionId: "r1",
        submittedAt: "2026-03-01T00:00:00.000Z",
        format: "singles" as const,
        teamAUserIds: ["alice"],
        teamBUserIds: ["bea"],
        games: [{ gameId: "g1", gameNumber: 1, teamAScore: 21, teamBScore: 18, winnerTeam: "A" as const }],
      },
      {
        id: "m2",
        revisionId: "r2",
        submittedAt: "2026-03-02T00:00:00.000Z",
        format: "singles" as const,
        teamAUserIds: ["bea"],
        teamBUserIds: ["cory"],
        games: [
          { gameId: "g2", gameNumber: 1, teamAScore: 18, teamBScore: 21, winnerTeam: "B" as const },
          { gameId: "g3", gameNumber: 2, teamAScore: 21, teamBScore: 17, winnerTeam: "A" as const },
          { gameId: "g4", gameNumber: 3, teamAScore: 19, teamBScore: 21, winnerTeam: "B" as const },
        ],
      },
    ];
    const full = rebuildGroupRatingsFromMatches(history);
    const prefix = rebuildGroupRatingsFromMatches(history.slice(0, 1));
    const ratingSeedBefore = structuredClone([...prefix.ratings]);
    const consistencySeedBefore = structuredClone([...prefix.consistencyStates]);
    const suffix = rebuildGroupRatingsFromMatches(
      history.slice(1),
      prefix.ratings,
      prefix.events.length,
      prefix.consistencyStates,
      prefix.consistencyEvents.length,
    );

    expect([...suffix.ratings]).toEqual([...full.ratings]);
    expect([...suffix.consistencyStates]).toEqual([...full.consistencyStates]);
    expect([...prefix.events, ...suffix.events]).toEqual(full.events);
    expect([...prefix.consistencyEvents, ...suffix.consistencyEvents]).toEqual(full.consistencyEvents);
    expect([...prefix.ratings]).toEqual(ratingSeedBefore);
    expect([...prefix.consistencyStates]).toEqual(consistencySeedBefore);
    expect(suffix.consistencyEvents.find((event) => event.userId === "cory")?.before).toEqual({
      logKappaMean: Math.log(200),
      logKappaVariance: 0.12249999999999998,
      matchesPlayed: 0,
    });
  });
});
