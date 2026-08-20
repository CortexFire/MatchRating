import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONSISTENCY_CONFIG,
  createDefaultConsistencyState,
  normalCdf,
  performanceSd,
  updateMatchConsistency,
  type ConsistencyState,
} from "./consistency";

describe("consistency scalar helpers", () => {
  it("creates the fixed population prior by default", () => {
    expect(DEFAULT_CONSISTENCY_CONFIG).toEqual({
      populationKappa: 200,
      priorLogSd: 0.35,
      driftLogSd: 0.02,
    });
    expect(createDefaultConsistencyState()).toEqual({
      logKappaMean: Math.log(200),
      logKappaVariance: 0.12249999999999998,
      matchesPlayed: 0,
    });
  });

  it("uses custom prior configuration", () => {
    expect(createDefaultConsistencyState({
      populationKappa: 150,
      priorLogSd: 0.2,
      driftLogSd: 0.01,
    })).toEqual({
      logKappaMean: Math.log(150),
      logKappaVariance: 0.04000000000000001,
      matchesPlayed: 0,
    });
  });

  it("displays the posterior median in rating points", () => {
    expect(performanceSd({
      logKappaMean: Math.log(175),
      logKappaVariance: 0.08,
      matchesPlayed: 4,
    })).toBeCloseTo(175, 12);
  });

  it("rejects invalid states and configurations", () => {
    expect(() => performanceSd({
      logKappaMean: Number.NaN,
      logKappaVariance: 0.08,
      matchesPlayed: 4,
    })).toThrow("Invalid consistency state");
    expect(() => performanceSd({
      logKappaMean: Math.log(175),
      logKappaVariance: 0,
      matchesPlayed: 4,
    })).toThrow("Invalid consistency state");
    expect(() => performanceSd({
      logKappaMean: Math.log(175),
      logKappaVariance: 0.08,
      matchesPlayed: -1,
    })).toThrow("Invalid consistency state");
    expect(() => createDefaultConsistencyState({
      populationKappa: 200,
      priorLogSd: 0,
      driftLogSd: 0.02,
    })).toThrow("Invalid consistency configuration");
    expect(() => performanceSd({
      logKappaMean: Math.log(20),
      logKappaVariance: 0.08,
      matchesPlayed: 4,
    })).toThrow("Invalid consistency state");
    expect(() => createDefaultConsistencyState({
      populationKappa: 700,
      priorLogSd: 0.35,
      driftLogSd: 0.02,
    })).toThrow("Invalid consistency configuration");
  });

  it("rejects non-finite normal CDF inputs", () => {
    expect(() => normalCdf(Number.POSITIVE_INFINITY)).toThrow(
      "Normal CDF requires a finite value",
    );
  });

  it("rejects a prior whose derived default variance is non-finite", () => {
    expect(() => createDefaultConsistencyState({
      populationKappa: 200,
      priorLogSd: Number.MAX_VALUE,
      driftLogSd: 0.02,
    })).toThrow("Invalid consistency configuration");
  });

  it.each([
    [0, 0.5],
    [1, 0.8413447461],
    [-1, 0.1586552539],
    [1.96, 0.9750021049],
    [-1.96, 0.0249978951],
  ])("matches the standard normal CDF reference at %s", (value, expected) => {
    expect(normalCdf(value)).toBeCloseTo(expected, 7);
  });
});

function participant(
  userId: string,
  rating = 1500,
  kappa = 200,
  variance = 0.1,
  matchesPlayed = 2,
) {
  return {
    userId,
    rating,
    consistency: {
      logKappaMean: Math.log(kappa),
      logKappaVariance: variance,
      matchesPlayed,
    } satisfies ConsistencyState,
  };
}

describe("match-level consistency replay", () => {
  it("rejects invalid teams, duplicate users, and non-finite ratings", () => {
    const base = {
      matchId: "match-1",
      revisionId: "revision-1",
      occurredAt: "2026-03-01T12:00:00.000Z",
      format: "singles" as const,
      winnerTeam: "A" as const,
      teamA: [participant("alice")],
      teamB: [participant("bea")],
    };

    expect(() => updateMatchConsistency({ ...base, teamA: [] })).toThrow(
      "Invalid singles team shape",
    );
    expect(() => updateMatchConsistency({
      ...base,
      teamB: [participant("alice")],
    })).toThrow("Duplicate consistency participant");
    expect(() => updateMatchConsistency({
      ...base,
      teamB: [participant("bea", Number.POSITIVE_INFINITY)],
    })).toThrow("Invalid consistency participant");
  });

  it("adds drift exactly once without moving means when team ratings are equal", () => {
    const alice = participant("alice", 1500, 150, 0.04, 7);
    const bea = participant("bea", 1500, 250, 0.09, 11);
    const result = updateMatchConsistency({
      matchId: "match-equal",
      revisionId: "revision-equal",
      occurredAt: "2026-03-02T12:00:00.000Z",
      format: "singles",
      winnerTeam: "A",
      teamA: [alice],
      teamB: [bea],
      sequenceOffset: 20,
    }, {
      populationKappa: 200,
      priorLogSd: 0.35,
      driftLogSd: 0.1,
    });

    expect(result.teamAWinProbability).toBe(0.5);
    expect(result.states.get("alice")).toMatchObject({
      logKappaMean: alice.consistency.logKappaMean,
      matchesPlayed: 8,
    });
    expect(result.states.get("alice")?.logKappaVariance).toBeCloseTo(0.05, 12);
    expect(result.states.get("bea")).toMatchObject({
      logKappaMean: bea.consistency.logKappaMean,
      matchesPlayed: 12,
    });
    expect(result.states.get("bea")?.logKappaVariance).toBeCloseTo(0.1, 12);
    expect(result.events).toEqual([
      {
        matchId: "match-equal",
        revisionId: "revision-equal",
        occurredAt: "2026-03-02T12:00:00.000Z",
        format: "singles",
        team: "A",
        userId: "alice",
        sequence: 21,
        expectedScore: 0.5,
        actualScore: 1,
        before: alice.consistency,
        after: result.states.get("alice"),
      },
      {
        matchId: "match-equal",
        revisionId: "revision-equal",
        occurredAt: "2026-03-02T12:00:00.000Z",
        format: "singles",
        team: "B",
        userId: "bea",
        sequence: 22,
        expectedScore: 0.5,
        actualScore: 0,
        before: bea.consistency,
        after: result.states.get("bea"),
      },
    ]);
    expect(result.events[0].before).not.toBe(alice.consistency);
    expect(result.events[0].after).not.toBe(result.states.get("alice"));
  });

  it("lowers symmetric kappas after an expected favorite win", () => {
    const alice = participant("alice", 1700);
    const bea = participant("bea", 1500);
    const result = updateMatchConsistency({
      matchId: "match-favorite",
      revisionId: "revision-favorite",
      occurredAt: "2026-03-03T12:00:00.000Z",
      format: "singles",
      winnerTeam: "A",
      teamA: [alice],
      teamB: [bea],
    });

    expect(result.teamAWinProbability).toBeCloseTo(0.7602499389, 7);
    expect(result.states.get("alice")!.logKappaMean).toBeLessThan(
      alice.consistency.logKappaMean,
    );
    expect(result.states.get("bea")!.logKappaMean).toBe(
      result.states.get("alice")!.logKappaMean,
    );
    expect(result.states.get("bea")!.logKappaVariance).toBe(
      result.states.get("alice")!.logKappaVariance,
    );
  });

  it("raises symmetric kappas after a favorite is upset", () => {
    const alice = participant("alice", 1700);
    const bea = participant("bea", 1500);
    const result = updateMatchConsistency({
      matchId: "match-upset",
      revisionId: "revision-upset",
      occurredAt: "2026-03-04T12:00:00.000Z",
      format: "singles",
      winnerTeam: "B",
      teamA: [alice],
      teamB: [bea],
    });

    expect(result.states.get("alice")!.logKappaMean).toBeGreaterThan(
      alice.consistency.logKappaMean,
    );
    expect(result.states.get("bea")!.logKappaMean).toBe(
      result.states.get("alice")!.logKappaMean,
    );
  });

  it("uses average team ratings and half weights for doubles", () => {
    const result = updateMatchConsistency({
      matchId: "match-doubles",
      revisionId: "revision-doubles",
      occurredAt: "2026-03-05T12:00:00.000Z",
      format: "doubles",
      winnerTeam: "A",
      teamA: [participant("alice", 1700), participant("cory", 1300)],
      teamB: [participant("bea", 1400), participant("dev", 1400)],
      sequenceOffset: 6,
    });

    expect(result.teamAWinProbability).toBeCloseTo(0.6914624613, 7);
    expect(result.events.map((event) => ({
      userId: event.userId,
      team: event.team,
      sequence: event.sequence,
      expectedScore: event.expectedScore,
      actualScore: event.actualScore,
    }))).toEqual([
      { userId: "alice", team: "A", sequence: 7, expectedScore: result.teamAWinProbability, actualScore: 1 },
      { userId: "cory", team: "A", sequence: 8, expectedScore: result.teamAWinProbability, actualScore: 1 },
      { userId: "bea", team: "B", sequence: 9, expectedScore: 1 - result.teamAWinProbability, actualScore: 0 },
      { userId: "dev", team: "B", sequence: 10, expectedScore: 1 - result.teamAWinProbability, actualScore: 0 },
    ]);
    expect(result.states.size).toBe(4);
    expect([...result.states.values()].map((state) => state.matchesPlayed)).toEqual([
      3,
      3,
      3,
      3,
    ]);
  });

  it("keeps posterior kappas and marginal variances finite and bounded", () => {
    const lowerBoundResult = updateMatchConsistency({
      matchId: "match-lower-bound",
      revisionId: "revision-lower-bound",
      occurredAt: "2026-03-06T12:00:00.000Z",
      format: "singles",
      winnerTeam: "A",
      teamA: [participant("alice", 2000, 30)],
      teamB: [participant("bea", 1000, 30)],
    });
    const upperBoundResult = updateMatchConsistency({
      matchId: "match-upper-bound",
      revisionId: "revision-upper-bound",
      occurredAt: "2026-03-07T12:00:00.000Z",
      format: "singles",
      winnerTeam: "B",
      teamA: [participant("cory", 2000, 600)],
      teamB: [participant("dev", 1000, 600)],
    });

    for (const state of [
      ...lowerBoundResult.states.values(),
      ...upperBoundResult.states.values(),
    ]) {
      expect(performanceSd(state)).toBeGreaterThanOrEqual(30);
      expect(performanceSd(state)).toBeLessThanOrEqual(600);
      expect(state.logKappaVariance).toBeGreaterThan(0);
      expect(state.logKappaVariance).toBeLessThanOrEqual(0.1004);
    }
  });

  it("rejects invalid formats and non-finite derived model values", () => {
    const base = {
      matchId: "match-invalid-model",
      revisionId: "revision-invalid-model",
      occurredAt: "2026-03-08T12:00:00.000Z",
      format: "singles" as const,
      winnerTeam: "A" as const,
      teamA: [participant("alice", 1e308)],
      teamB: [participant("bea", -1e308)],
    };

    expect(() => updateMatchConsistency(base)).toThrow(
      "Non-finite consistency model input",
    );
    expect(() => updateMatchConsistency({
      ...base,
      format: "triples" as "singles",
      teamA: [],
      teamB: [],
    })).toThrow("Invalid match format");
  });

  it("rejects a non-finite drifted posterior instead of returning partial state", () => {
    expect(() => updateMatchConsistency({
      matchId: "match-overflow",
      revisionId: "revision-overflow",
      occurredAt: "2026-03-09T12:00:00.000Z",
      format: "singles",
      winnerTeam: "A",
      teamA: [participant("alice")],
      teamB: [participant("bea")],
    }, {
      populationKappa: 200,
      priorLogSd: 0.35,
      driftLogSd: Number.MAX_VALUE,
    })).toThrow("Non-finite consistency posterior");
  });

  it("rejects an unsafe post-match count before building results", () => {
    expect(() => updateMatchConsistency({
      matchId: "match-count-overflow",
      revisionId: "revision-count-overflow",
      occurredAt: "2026-03-10T12:00:00.000Z",
      format: "singles",
      winnerTeam: "A",
      teamA: [participant("alice", 1500, 200, 0.1, Number.MAX_SAFE_INTEGER)],
      teamB: [participant("bea")],
    })).toThrow("Invalid consistency matches played");
  });

  it("rejects an unsafe event sequence range before building results", () => {
    expect(() => updateMatchConsistency({
      matchId: "match-sequence-overflow",
      revisionId: "revision-sequence-overflow",
      occurredAt: "2026-03-11T12:00:00.000Z",
      format: "singles",
      winnerTeam: "A",
      teamA: [participant("alice")],
      teamB: [participant("bea")],
      sequenceOffset: Number.MAX_SAFE_INTEGER,
    })).toThrow("Invalid consistency sequence range");
  });
});
