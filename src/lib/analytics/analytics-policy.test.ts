import { describe, expect, test } from "vitest";
import {
  projectPlayerAnalytics,
  type AnalyticsFactsPayload,
  type AnalyticsMatchFact,
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
    ratingAfter: 1510,
    ratingDelta: 10,
    partners: [],
    opponents: [bea],
    ...overrides,
  };
}

function facts(overrides: Partial<AnalyticsFactsPayload> = {}): AnalyticsFactsPayload {
  return {
    status: "ready",
    asOf: "2026-08-19T12:00:00.000Z",
    viewerUserId: "alice",
    subject: alice,
    group: { id: "group-1", name: "Downtown Rec" },
    availableGroups: [{ id: "group-1", name: "Downtown Rec" }],
    current: { rating: 1580, rank: 1, rankedPlayerCount: 3 },
    activePlayerIds: ["alice", "bea", "cory"],
    matches: [],
    cohortDaily: [],
    cohortPartners: [],
    ...overrides,
  };
}

describe("player analytics policy", () => {
  test("keeps current rank and rating fixed while period performance changes", () => {
    const result = projectPlayerAnalytics(facts({
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
      ratingChange: 10,
      wins: 1,
      losses: 1,
      winRate: 50,
    });
    expect(result.periods["30d"].summary).toEqual({
      rank: 1,
      rankedPlayerCount: 3,
      currentRating: 1580,
      ratingChange: 20,
      wins: 1,
      losses: 0,
      winRate: 100,
    });
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
    const result = projectPlayerAnalytics(facts({
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
    const result = projectPlayerAnalytics(facts({ matches }));

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const insights = result.periods.all.matchups;
    expect(insights.find((insight) => insight.key === "best-partner")?.player).toEqual(bea);
    expect(insights.find((insight) => insight.key === "most-frequent-opponent")?.player).toEqual(cory);
    expect(insights.some((insight) => insight.player.id === "dev")).toBe(false);
  });

  test("preserves the updating state without inventing partial analytics", () => {
    const result = projectPlayerAnalytics({
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
