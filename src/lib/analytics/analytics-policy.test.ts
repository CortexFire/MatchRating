import { describe, expect, test } from "vitest";
import {
  projectAggregatedPlayerAnalytics,
  projectLegacyPlayerAnalytics,
  sampleAnalyticsRatingPoints,
  type AggregatedAnalyticsFactsPayload,
  type AggregatedAnalyticsPeriodFacts,
  type AnalyticsMatchFact,
  type LegacyAnalyticsFactsPayload,
} from "./analytics-policy";

const alice = { id: "alice", name: "Alice Tan" };
const bea = { id: "bea", name: "Bea Rivera" };
const cory = { id: "cory", name: "Cory Shah" };

function match(
  id: string,
  occurredAt: string,
  overrides: Partial<AnalyticsMatchFact> = {},
): AnalyticsMatchFact {
  return {
    id,
    occurredAt,
    format: "singles",
    matchWon: true,
    gameCount: 1,
    gameWins: 1,
    expectedGameWins: 0.5,
    ratingBefore: 1500,
    rdBefore: 120.25,
    ratingAfter: 1510,
    rdAfter: 109.75,
    performanceSdAfter: 200,
    ratingDelta: 10,
    partners: [],
    opponents: [bea],
    ...overrides,
  };
}

test("projects each match's canonical post-match consistency into rating history", () => {
  const first = { ...match("first", "2026-08-01T12:00:00.000Z"), performanceSdAfter: 200 };
  const second = { ...match("second", "2026-08-02T12:00:00.000Z", { ratingAfter: 1525 }), performanceSdAfter: 85 };

  expect(allPeriod({ matches: [first, second] }).ratingHistory).toEqual([
    expect.objectContaining({ matchId: "first", rating: 1510, performanceSd: 200 }),
    expect.objectContaining({ matchId: "second", rating: 1525, performanceSd: 85 }),
  ]);
});

function facts(overrides: Partial<LegacyAnalyticsFactsPayload> = {}): LegacyAnalyticsFactsPayload {
  return {
    status: "ready",
    asOf: "2026-08-19T12:00:00.000Z",
    viewerUserId: "alice",
    subject: alice,
    group: { id: "group-1", name: "Downtown Rec" },
    availableGroups: [{ id: "group-1", name: "Downtown Rec" }],
    current: { rating: 1580, rd: 110.01, rank: 1, rankedPlayerCount: 3 },
    activePlayerIds: ["alice", "bea", "cory"],
    matches: [],
    cohortDaily: [],
    cohortPartners: [],
    ...overrides,
  };
}

function allPeriod(overrides: Partial<LegacyAnalyticsFactsPayload>) {
  const result = projectLegacyPlayerAnalytics(facts(overrides));
  if (result.status !== "ready") throw new Error("Expected ready analytics");
  return result.periods.all;
}

describe("player analytics policy", () => {
  test("keeps current rank and rating fixed while period performance changes", () => {
    const result = projectLegacyPlayerAnalytics(facts({
      matches: [
        match("old", "2025-01-01T12:00:00.000Z", { matchWon: false, gameWins: 0, ratingAfter: 1490, ratingDelta: -10 }),
        match("recent", "2026-08-10T12:00:00.000Z", { ratingBefore: 1490, ratingAfter: 1510, ratingDelta: 20 }),
      ],
    }));

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.periods.all.summary).toEqual({
      rank: 1,
      rankedPlayerCount: 3,
      currentRating: 1580,
      currentRd: 110.01,
      ratingChange: 10,
      wins: 1,
      losses: 1,
      winRate: 50,
    });
    expect(result.periods["30d"].summary).toEqual({
      rank: 1,
      rankedPlayerCount: 3,
      currentRating: 1580,
      currentRd: 110.01,
      ratingChange: 20,
      wins: 1,
      losses: 0,
      winRate: 100,
    });
    expect(result.periods.all.ratingHistory).toEqual([
      { matchId: "old", occurredAt: "2025-01-01T12:00:00.000Z", rating: 1490, rd: 109.75, performanceSd: 200, ratingDelta: -10 },
      { matchId: "recent", occurredAt: "2026-08-10T12:00:00.000Z", rating: 1510, rd: 109.75, performanceSd: 200, ratingDelta: 20 },
    ]);
  });

  test("awards current and period flags at their exact v1 boundaries", () => {
    const matches = Array.from({ length: 8 }, (_, index) => match(
      `m${index + 1}`,
      `2026-08-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
      {
        expectedGameWins: 0.8,
        ratingBefore: 1500 + index * 10,
        ratingAfter: 1510 + index * 10,
        partners: index < 5 ? [{ id: `partner-${index}`, name: `Partner ${index}` }] : [],
        opponents: index % 2 === 0 ? [bea] : [cory],
        format: index < 5 ? "doubles" : "singles",
      },
    ));
    const result = projectLegacyPlayerAnalytics(facts({
      matches,
      cohortDaily: [
        { userId: "alice", statDate: "2026-08-01", matchCount: 8, ratingDelta: 80, doublesMatchCount: 5 },
        { userId: "bea", statDate: "2026-08-01", matchCount: 6, ratingDelta: 20, doublesMatchCount: 4 },
        { userId: "cory", statDate: "2026-08-01", matchCount: 4, ratingDelta: -5, doublesMatchCount: 3 },
      ],
      cohortPartners: [
        ...Array.from({ length: 5 }, (_, index) => ({ userId: "alice", relatedUserId: `partner-${index}`, statDate: "2026-08-01" })),
        { userId: "bea", relatedUserId: "p1", statDate: "2026-08-01" },
        { userId: "cory", relatedUserId: "p2", statDate: "2026-08-01" },
      ],
    }));

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.periods.all.flags.map((flag) => flag.key)).toEqual(expect.arrayContaining([
      "hot-streak",
      "social-butterfly",
      "very-active",
      "fast-climber",
      "group-leader",
      "team-player",
      "dominant",
    ]));
  });

  test("returns neutral, metric-specific explanations for every flag", () => {
    const featuredMatches = Array.from({ length: 8 }, (_, index) => match(
      `featured-${index + 1}`,
      `2026-08-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
      {
        expectedGameWins: 0.8,
        partners: index < 5 ? [{ id: `partner-${index}`, name: `Partner ${index}` }] : [],
        opponents: index % 2 === 0 ? [bea] : [cory],
        format: index < 5 ? "doubles" : "singles",
      },
    ));
    const featuredFlags = allPeriod({
      matches: featuredMatches,
      cohortDaily: [
        { userId: "alice", statDate: "2026-08-01", matchCount: 8, ratingDelta: 80, doublesMatchCount: 5 },
        { userId: "bea", statDate: "2026-08-01", matchCount: 6, ratingDelta: 20, doublesMatchCount: 4 },
        { userId: "cory", statDate: "2026-08-01", matchCount: 4, ratingDelta: -5, doublesMatchCount: 3 },
      ],
      cohortPartners: [
        ...Array.from({ length: 5 }, (_, index) => ({ userId: "alice", relatedUserId: `partner-${index}`, statDate: "2026-08-01" })),
        { userId: "bea", relatedUserId: "p1", statDate: "2026-08-01" },
        { userId: "cory", relatedUserId: "p2", statDate: "2026-08-01" },
      ],
    }).flags;
    const underdogFlags = allPeriod({
      matches: Array.from({ length: 8 }, (_, index) => match(
        `underdog-${index + 1}`,
        `2026-08-${String(index + 1).padStart(2, "0")}T13:00:00.000Z`,
        { expectedGameWins: 0.3 },
      )),
    }).flags;
    const consistentFlags = allPeriod({
      matches: Array.from({ length: 8 }, (_, index) => match(
        `consistent-${index + 1}`,
        `2026-08-${String(index + 1).padStart(2, "0")}T14:00:00.000Z`,
        { gameCount: 2, gameWins: 1, expectedGameWins: 1 },
      )),
    }).flags;
    const explanations = Object.fromEntries(
      [...featuredFlags, ...underdogFlags, ...consistentFlags]
        .map((flag) => [flag.key, flag.explanation]),
    );

    expect(explanations).toEqual({
      "hot-streak": "Won the last 8 matches.",
      "social-butterfly": "Played with or against 2 of 2 active players.",
      "giant-slayer": "Won 8 matches despite being the clear underdog.",
      "tough-schedule": "Faced tougher-than-average competition across the last 8 matches.",
      "very-active": "Played 8 matches, ranking among the group’s most active players.",
      "fast-climber": "Gained 80 rating points in this period.",
      overperformer: "Won 100% of games when matchups predicted a 30% win rate.",
      consistent: "Results closely matched expected performance across 8 matches.",
      "group-leader": "Currently ranked #1 in Downtown Rec.",
      "team-player": "Partnered with 5 different players in this period.",
      dominant: "Won 8 of 8 matches.",
    });
    expect(Object.values(explanations)).not.toEqual(expect.arrayContaining([
      expect.stringMatching(/\b(?:you|your)\b/i),
    ]));
  });

  test("rounds Fast Climber rating gains to whole unsigned points", () => {
    const flags = allPeriod({
      matches: Array.from({ length: 5 }, (_, index) => match(
        `rounded-${index + 1}`,
        `2026-08-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
      )),
      cohortDaily: [
        { userId: "alice", statDate: "2026-08-01", matchCount: 5, ratingDelta: 84.6, doublesMatchCount: 0 },
        { userId: "bea", statDate: "2026-08-01", matchCount: 5, ratingDelta: 10, doublesMatchCount: 0 },
        { userId: "cory", statDate: "2026-08-01", matchCount: 5, ratingDelta: 0, doublesMatchCount: 0 },
      ],
    }).flags;

    expect(flags.find((flag) => flag.key === "fast-climber")?.explanation)
      .toBe("Gained 85 rating points in this period.");
  });

  test("does not award Fast Climber when the rounded gain is zero or negative", () => {
    for (const [subjectGain, peerGains] of [
      [0.49, [0.2, 0.1]],
      [-0.51, [-2, -3]],
    ] as const) {
      const flags = allPeriod({
        matches: Array.from({ length: 5 }, (_, index) => match(
          `non-positive-${subjectGain}-${index + 1}`,
          `2026-08-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
        )),
        cohortDaily: [
          { userId: "alice", statDate: "2026-08-01", matchCount: 5, ratingDelta: subjectGain, doublesMatchCount: 0 },
          { userId: "bea", statDate: "2026-08-01", matchCount: 5, ratingDelta: peerGains[0], doublesMatchCount: 0 },
          { userId: "cory", statDate: "2026-08-01", matchCount: 5, ratingDelta: peerGains[1], doublesMatchCount: 0 },
        ],
      }).flags;

      expect(flags.some((flag) => flag.key === "fast-climber")).toBe(false);
    }
  });

  test("describes an underdog Best Partner with a finite whole-number rating equivalent", () => {
    const matches = Array.from({ length: 3 }, (_, index) => match(
      `best-underdog-${index}`,
      `2026-08-0${index + 1}T12:00:00.000Z`,
      {
        partners: [bea],
        opponents: [cory],
        expectedGameWins: 0.4,
      },
    ));

    const insight = allPeriod({ matches }).matchups.find((item) => item.key === "best-partner");

    expect(insight).toEqual({
      key: "best-partner",
      label: "Best Partner",
      player: bea,
      description: "Won 3 of 3 matches together when predicted to lose, performing as though rated 311 points higher.",
    });
    expect(insight?.description).not.toMatch(/[+\-]\d|\d+\.\d/);
  });

  test.each([
    {
      name: "favored and above expectations",
      wins: 3,
      gameWins: 3,
      expectedGameWins: 0.6,
      description: "Won 3 of 3 matches together, performing as though rated 170 points higher.",
    },
    {
      name: "in line with expectations",
      wins: 2,
      gameWins: 2,
      expectedGameWins: 0.6,
      description: "Won 2 of 3 matches together, performing in line with expectations.",
    },
    {
      name: "below expectations",
      wins: 1,
      gameWins: 1,
      expectedGameWins: 0.6,
      description: "Won 1 of 3 matches together, performing as though rated 141 points lower.",
    },
  ])("uses truthful Best Partner copy when $name", ({ wins, gameWins, expectedGameWins, description }) => {
    const matches = Array.from({ length: 3 }, (_, index) => match(
      `best-variant-${index}`,
      `2026-08-0${index + 1}T12:00:00.000Z`,
      {
        matchWon: index < wins,
        gameWins: index < gameWins ? 1 : 0,
        expectedGameWins,
        partners: [bea],
        opponents: [cory],
      },
    ));

    expect(allPeriod({ matches }).matchups.find((item) => item.key === "best-partner")?.description)
      .toBe(description);
  });

  test("uses clear copy for every retained Group Dynamics insight", () => {
    const partnerMatches = Array.from({ length: 4 }, (_, index) => match(
      `partner-${index}`,
      `2026-08-0${index + 1}T12:00:00.000Z`,
      {
        matchWon: index < 3,
        gameCount: 1,
        gameWins: index < 3 ? 1 : 0,
        expectedGameWins: 0.4,
        partners: [bea],
        opponents: [],
      },
    ));
    const opponentMatches = Array.from({ length: 4 }, (_, index) => match(
      `opponent-${index}`,
      `2026-08-1${index + 1}T12:00:00.000Z`,
      {
        matchWon: index < 2,
        gameCount: 3,
        gameWins: index < 2 ? 2 : 1,
        expectedGameWins: 2.25,
        partners: [],
        opponents: [cory],
      },
    ));

    const insights = allPeriod({ matches: [...partnerMatches, ...opponentMatches] }).matchups;

    expect(insights.map((item) => [item.key, item.description])).toEqual([
      ["best-partner", "Won 3 of 4 matches together when predicted to lose, performing as though rated 191 points higher."],
      ["closest-rival", "2–2 head-to-head · 50% win rate"],
      ["nemesis", "2–2 head-to-head · 25% worse than expected"],
      ["most-frequent-partner", "Played 4 matches together, winning 3 for a win rate of 75%."],
      ["most-frequent-opponent", "Played 12 games against this opponent."],
    ]);
    expect(insights.map((item) => item.description).join(" ")).not.toMatch(/\b(?:you|your)\b/i);
  });

  test("omits Nemesis when no eligible opponent performed worse than expected", () => {
    const matches = Array.from({ length: 3 }, (_, index) => match(
      `positive-opponent-${index}`,
      `2026-08-0${index + 1}T12:00:00.000Z`,
      {
        expectedGameWins: 0.5,
        opponents: [cory],
      },
    ));

    expect(allPeriod({ matches }).matchups.some((item) => item.key === "nemesis")).toBe(false);
  });

  test("omits Nemesis when underperformance rounds to zero percent", () => {
    const matches = Array.from({ length: 3 }, (_, index) => match(
      `rounded-nemesis-${index}`,
      `2026-08-0${index + 1}T12:00:00.000Z`,
      {
        matchWon: false,
        gameCount: 100,
        gameWins: 50,
        expectedGameWins: 50.4,
        opponents: [cory],
      },
    ));

    expect(allPeriod({ matches }).matchups.some((item) => item.key === "nemesis")).toBe(false);
  });

  test("selects deterministic relationship insights and omits samples below three matches", () => {
    const matches = [
      ...Array.from({ length: 3 }, (_, index) => match(`bea-${index}`, `2026-08-0${index + 1}T12:00:00.000Z`, {
        partners: [bea],
        opponents: [cory],
        expectedGameWins: 0.4,
      })),
      ...Array.from({ length: 2 }, (_, index) => match(`small-${index}`, `2026-08-1${index + 1}T12:00:00.000Z`, {
        partners: [cory],
        opponents: [{ id: "dev", name: "Dev Okafor" }],
      })),
    ];
    const result = projectLegacyPlayerAnalytics(facts({ matches }));

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const insights = result.periods.all.matchups;
    expect(insights.find((insight) => insight.key === "best-partner")?.player).toEqual(bea);
    expect(insights.find((insight) => insight.key === "most-frequent-opponent")?.player).toEqual(cory);
    expect(insights.some((insight) => insight.player.id === "dev")).toBe(false);
  });

  test("preserves the updating state without inventing partial analytics", () => {
    const result = projectLegacyPlayerAnalytics({
      status: "updating",
      asOf: "2026-08-19T12:00:00.000Z",
      viewerUserId: "alice",
      subject: alice,
      group: { id: "group-1", name: "Downtown Rec" },
      availableGroups: [{ id: "group-1", name: "Downtown Rec" }],
    });

    expect(result).toEqual(expect.objectContaining({ status: "updating", subject: alice }));
    expect("periods" in result).toBe(false);
  });
});

function aggregatePeriod(overrides: Partial<AggregatedAnalyticsPeriodFacts> = {}) {
  return {
    matchCount: 0,
    wins: 0,
    gameCount: 0,
    gameWins: 0,
    expectedGameWins: 0,
    ratingDelta: 0,
    upsetWins: 0,
    residualCount: 0,
    residualSum: 0,
    residualSumSquares: 0,
    activePeerCount: 2,
    encounteredActiveCount: 0,
    cohort: [
      { userId: "alice", matchCount: 0, ratingDelta: 0, doublesMatchCount: 0, distinctPartnerCount: 0 },
      { userId: "bea", matchCount: 0, ratingDelta: 0, doublesMatchCount: 0, distinctPartnerCount: 0 },
      { userId: "cory", matchCount: 0, ratingDelta: 0, doublesMatchCount: 0, distinctPartnerCount: 0 },
    ],
    relationships: [],
    ratingHistory: [],
    ratingHistoryBounds: [0, 1] as [number, number],
    ...overrides,
  };
}

function aggregatedFacts(
  period: ReturnType<typeof aggregatePeriod>,
): AggregatedAnalyticsFactsPayload {
  return {
    status: "ready",
    asOf: "2026-08-19T12:00:00.000Z",
    ratingVersion: "7",
    viewerUserId: "alice",
    subject: alice,
    group: { id: "group-1", name: "Downtown Rec" },
    availableGroups: [{ id: "group-1", name: "Downtown Rec" }],
    current: { rating: 1580, rd: 110.01, rank: 1, rankedPlayerCount: 3 },
    currentWinStreak: 8,
    periods: { all: period, "30d": period, "90d": period, "1y": period },
  };
}

describe("bounded player analytics policy", () => {
  test("matches the legacy oracle for summaries, flags, relationships, and exact point values", () => {
    const matches = Array.from({ length: 8 }, (_, index) => match(
      `match-${index + 1}`,
      `2026-08-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
      { opponents: [cory], expectedGameWins: 0.4 },
    ));
    const legacy = projectLegacyPlayerAnalytics(facts({
      matches,
      cohortDaily: [
        { userId: "alice", statDate: "2026-08-01", matchCount: 8, ratingDelta: 80, doublesMatchCount: 0 },
        { userId: "bea", statDate: "2026-08-01", matchCount: 5, ratingDelta: 30, doublesMatchCount: 0 },
      ],
    }));
    const points = matches.map((item) => ({
      matchId: item.id,
      occurredAt: item.occurredAt,
      rating: 1510,
      rd: 109.75,
      performanceSd: 200,
      ratingDelta: 10,
    }));
    const bounded = projectAggregatedPlayerAnalytics(aggregatedFacts(aggregatePeriod({
      matchCount: 8,
      wins: 8,
      gameCount: 8,
      gameWins: 8,
      expectedGameWins: 3.1999999999999997,
      ratingDelta: 80,
      upsetWins: 0,
      residualCount: 8,
      residualSum: 4.8,
      residualSumSquares: 2.88,
      encounteredActiveCount: 1,
      cohort: [
        { userId: "alice", matchCount: 8, ratingDelta: 80, doublesMatchCount: 0, distinctPartnerCount: 0 },
        { userId: "bea", matchCount: 5, ratingDelta: 30, doublesMatchCount: 0, distinctPartnerCount: 0 },
        { userId: "cory", matchCount: 0, ratingDelta: 0, doublesMatchCount: 0, distinctPartnerCount: 0 },
      ],
      relationships: [{
        player: cory,
        kind: "opponent",
        matches: 8,
        wins: 8,
        gameCount: 8,
        gameWins: 8,
        expectedGameWins: 3.1999999999999997,
      }],
      ratingHistory: points,
      ratingHistoryBounds: [1290, 1730],
    })));

    expect(legacy.status).toBe("ready");
    expect(bounded.status).toBe("ready");
    if (legacy.status !== "ready" || bounded.status !== "ready") return;

    for (const period of ["all", "30d", "90d", "1y"] as const) {
      expect(bounded.periods[period].summary).toEqual(legacy.periods[period].summary);
      expect(bounded.periods[period].flags).toEqual(legacy.periods[period].flags);
      expect(bounded.periods[period].matchups).toEqual(legacy.periods[period].matchups);
      expect(bounded.periods[period].ratingHistoryPointIds).toEqual(
        legacy.periods[period].ratingHistory.map((point) => point.matchId),
      );
    }
    expect(bounded.ratingVersion).toBe("7");
    expect(bounded.historyPoints).toEqual(Object.fromEntries(points.map((point) => [point.matchId, point])));
  });

  test("deduplicates overlapping period samples into one point dictionary", () => {
    const point = {
      matchId: "shared-match",
      occurredAt: "2026-08-18T12:00:00.000Z",
      rating: 1580,
      rd: 110.01,
      performanceSd: 85,
      ratingDelta: 12,
    };
    const payload = aggregatedFacts(aggregatePeriod({ ratingHistory: [point] }));

    const result = projectAggregatedPlayerAnalytics(payload);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.historyPoints).toEqual({ "shared-match": point });
    expect(Object.values(result.periods).every((period) => (
      period.ratingHistoryPointIds[0] === "shared-match"
    ))).toBe(true);
  });

  test("matches the legacy oracle across every flag threshold family", () => {
    const featuredMatches = Array.from({ length: 8 }, (_, index) => match(
      `featured-parity-${index + 1}`,
      `2026-08-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
      {
        expectedGameWins: 0.8,
        partners: index < 5 ? [{ id: `partner-${index}`, name: `Partner ${index}` }] : [],
        opponents: index % 2 === 0 ? [bea] : [cory],
        format: index < 5 ? "doubles" : "singles",
      },
    ));
    const featuredLegacy = allPeriod({
      matches: featuredMatches,
      cohortDaily: [
        { userId: "alice", statDate: "2026-08-01", matchCount: 8, ratingDelta: 80, doublesMatchCount: 5 },
        { userId: "bea", statDate: "2026-08-01", matchCount: 6, ratingDelta: 20, doublesMatchCount: 4 },
        { userId: "cory", statDate: "2026-08-01", matchCount: 4, ratingDelta: -5, doublesMatchCount: 3 },
      ],
      cohortPartners: [
        ...Array.from({ length: 5 }, (_, index) => ({
          userId: "alice",
          relatedUserId: `partner-${index}`,
          statDate: "2026-08-01",
        })),
        { userId: "bea", relatedUserId: "p1", statDate: "2026-08-01" },
        { userId: "cory", relatedUserId: "p2", statDate: "2026-08-01" },
      ],
    }).flags;
    const featuredBounded = projectAggregatedPlayerAnalytics(aggregatedFacts(aggregatePeriod({
      matchCount: 8,
      wins: 8,
      gameCount: 8,
      gameWins: 8,
      expectedGameWins: 6.3999999999999995,
      ratingDelta: 80,
      residualCount: 8,
      residualSum: 1.5999999999999999,
      residualSumSquares: 0.31999999999999984,
      encounteredActiveCount: 2,
      cohort: [
        { userId: "alice", matchCount: 8, ratingDelta: 80, doublesMatchCount: 5, distinctPartnerCount: 5 },
        { userId: "bea", matchCount: 6, ratingDelta: 20, doublesMatchCount: 4, distinctPartnerCount: 1 },
        { userId: "cory", matchCount: 4, ratingDelta: -5, doublesMatchCount: 3, distinctPartnerCount: 1 },
      ],
    })));

    const underdogMatches = Array.from({ length: 8 }, (_, index) => match(
      `underdog-parity-${index + 1}`,
      `2026-08-${String(index + 1).padStart(2, "0")}T13:00:00.000Z`,
      { expectedGameWins: 0.3 },
    ));
    const underdogLegacy = allPeriod({ matches: underdogMatches }).flags;
    const underdogBounded = projectAggregatedPlayerAnalytics(aggregatedFacts(aggregatePeriod({
      matchCount: 8,
      wins: 8,
      gameCount: 8,
      gameWins: 8,
      expectedGameWins: 2.4,
      ratingDelta: 80,
      upsetWins: 8,
      residualCount: 8,
      residualSum: 5.6,
      residualSumSquares: 3.9199999999999995,
    })));

    const consistentMatches = Array.from({ length: 8 }, (_, index) => match(
      `consistent-parity-${index + 1}`,
      `2026-08-${String(index + 1).padStart(2, "0")}T14:00:00.000Z`,
      { gameCount: 2, gameWins: 1, expectedGameWins: 1 },
    ));
    const consistentLegacy = allPeriod({ matches: consistentMatches }).flags;
    const consistentBounded = projectAggregatedPlayerAnalytics(aggregatedFacts(aggregatePeriod({
      matchCount: 8,
      wins: 8,
      gameCount: 16,
      gameWins: 8,
      expectedGameWins: 8,
      ratingDelta: 80,
      residualCount: 8,
      residualSum: 0,
      residualSumSquares: 0,
    })));

    for (const [bounded, legacy] of [
      [featuredBounded, featuredLegacy],
      [underdogBounded, underdogLegacy],
      [consistentBounded, consistentLegacy],
    ] as const) {
      expect(bounded.status).toBe("ready");
      if (bounded.status !== "ready") continue;
      expect(bounded.periods.all.flags).toEqual(legacy);
    }
  });

  test("matches the legacy oracle for every retained relationship insight", () => {
    const partnerMatches = Array.from({ length: 4 }, (_, index) => match(
      `partner-parity-${index}`,
      `2026-08-0${index + 1}T12:00:00.000Z`,
      {
        matchWon: index < 3,
        gameCount: 1,
        gameWins: index < 3 ? 1 : 0,
        expectedGameWins: 0.4,
        partners: [bea],
        opponents: [],
      },
    ));
    const opponentMatches = Array.from({ length: 4 }, (_, index) => match(
      `opponent-parity-${index}`,
      `2026-08-1${index + 1}T12:00:00.000Z`,
      {
        matchWon: index < 2,
        gameCount: 3,
        gameWins: index < 2 ? 2 : 1,
        expectedGameWins: 2.25,
        partners: [],
        opponents: [cory],
      },
    ));
    const legacy = allPeriod({ matches: [...partnerMatches, ...opponentMatches] }).matchups;
    const bounded = projectAggregatedPlayerAnalytics(aggregatedFacts(aggregatePeriod({
      relationships: [
        {
          player: bea,
          kind: "partner",
          matches: 4,
          wins: 3,
          gameCount: 4,
          gameWins: 3,
          expectedGameWins: 1.6,
        },
        {
          player: cory,
          kind: "opponent",
          matches: 4,
          wins: 2,
          gameCount: 12,
          gameWins: 6,
          expectedGameWins: 9,
        },
      ],
    })));

    expect(bounded.status).toBe("ready");
    if (bounded.status !== "ready") return;
    expect(bounded.periods.all.matchups).toEqual(legacy);
  });

  test("samples full histories with deterministic extrema and never exceeds 200 points", () => {
    const points = Array.from({ length: 203 }, (_, index) => ({
      matchId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      occurredAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
      rating: index === 2 || index === 3 ? 1000 : 1500 + (index % 3),
      rd: 100,
      performanceSd: index === 4 ? 700 : 80,
      ratingDelta: 1,
    }));

    const sampled = sampleAnalyticsRatingPoints(points);

    expect(sampled.length).toBeLessThanOrEqual(200);
    expect(sampled[0]).toEqual(points[0]);
    expect(sampled.at(-1)).toEqual(points.at(-1));
    expect(sampled).toContainEqual(points[2]);
    expect(sampled).not.toContainEqual(points[3]);
    expect(sampled).toContainEqual(points[4]);
  });

  test("preserves every point when the history already fits the contract", () => {
    const points = Array.from({ length: 200 }, (_, index) => ({
      matchId: `match-${index}`,
      occurredAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
      rating: 1500 + index,
      rd: 100,
      performanceSd: 80,
      ratingDelta: 1,
    }));

    expect(sampleAnalyticsRatingPoints(points)).toEqual(points);
  });
});
