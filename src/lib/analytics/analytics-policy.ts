export type AnalyticsPeriod = "all" | "30d" | "90d" | "1y";
export type AnalyticsFlagKey =
  | "hot-streak"
  | "social-butterfly"
  | "giant-slayer"
  | "tough-schedule"
  | "very-active"
  | "fast-climber"
  | "overperformer"
  | "consistent"
  | "group-leader"
  | "team-player"
  | "dominant";
export type MatchupInsightKey =
  | "best-partner"
  | "closest-rival"
  | "nemesis"
  | "most-frequent-partner"
  | "most-frequent-opponent";

export type AnalyticsPerson = { id: string; name: string };
export type AnalyticsGroup = { id: string; name: string };

export type AnalyticsMatchFact = {
  id: string;
  occurredAt: string;
  format: "singles" | "doubles";
  matchWon: boolean;
  gameCount: number;
  gameWins: number;
  expectedGameWins: number;
  ratingBefore: number;
  rdBefore: number;
  ratingAfter: number;
  rdAfter: number;
  performanceSdAfter: number;
  ratingDelta: number;
  partners: AnalyticsPerson[];
  opponents: AnalyticsPerson[];
};

export type AnalyticsCohortDailyFact = {
  userId: string;
  statDate: string;
  matchCount: number;
  ratingDelta: number;
  doublesMatchCount: number;
};

export type AnalyticsCohortPartnerFact = {
  userId: string;
  relatedUserId: string;
  statDate: string;
};

type AnalyticsFactsBase = {
  asOf: string;
  viewerUserId: string;
  subject: AnalyticsPerson;
  group: AnalyticsGroup;
  availableGroups: AnalyticsGroup[];
};

export type LegacyAnalyticsFactsPayload = AnalyticsFactsBase & ({
  status: "updating";
} | {
  status: "ready";
  current: { rating: number; rd: number; rank: number; rankedPlayerCount: number };
  activePlayerIds: string[];
  matches: AnalyticsMatchFact[];
  cohortDaily: AnalyticsCohortDailyFact[];
  cohortPartners: AnalyticsCohortPartnerFact[];
});

export type AnalyticsSummary = {
  rank: number;
  rankedPlayerCount: number;
  currentRating: number;
  currentRd: number;
  ratingChange: number;
  wins: number;
  losses: number;
  winRate: number | null;
};

export type AnalyticsFlag = {
  key: AnalyticsFlagKey;
  label: string;
  explanation: string;
};

export type MatchupInsight = {
  key: MatchupInsightKey;
  label: string;
  player: AnalyticsPerson;
  description: string;
};

export type LegacyAnalyticsPeriodSnapshot = {
  summary: AnalyticsSummary;
  ratingHistory: Array<{
    matchId: string;
    occurredAt: string;
    rating: number;
    rd: number;
    performanceSd: number;
    ratingDelta: number;
  }>;
  flags: AnalyticsFlag[];
  matchups: MatchupInsight[];
};

export type LegacyPlayerAnalyticsViewModel = AnalyticsFactsBase & ({
  status: "updating";
} | {
  status: "ready";
  periods: Record<AnalyticsPeriod, LegacyAnalyticsPeriodSnapshot>;
});

export type AnalyticsRatingPoint = {
  matchId: string;
  occurredAt: string;
  rating: number;
  rd: number;
  performanceSd: number;
  ratingDelta: number;
};

export type AnalyticsPeriodSnapshot = {
  summary: AnalyticsSummary;
  flags: AnalyticsFlag[];
  matchups: MatchupInsight[];
  ratingHistoryPointIds: string[];
  ratingHistoryBounds: [number, number];
};

export type AnalyticsCohortAggregate = {
  userId: string;
  matchCount: number;
  ratingDelta: number;
  doublesMatchCount: number;
  distinctPartnerCount: number;
};

export type AnalyticsRelationshipAggregate = {
  player: AnalyticsPerson;
  kind: "partner" | "opponent";
  matches: number;
  wins: number;
  gameCount: number;
  gameWins: number;
  expectedGameWins: number;
};

export type AggregatedAnalyticsPeriodFacts = {
  matchCount: number;
  wins: number;
  gameCount: number;
  gameWins: number;
  expectedGameWins: number;
  ratingDelta: number;
  upsetWins: number;
  residualCount: number;
  residualSum: number;
  residualSumSquares: number;
  activePeerCount: number;
  encounteredActiveCount: number;
  cohort: AnalyticsCohortAggregate[];
  relationships: AnalyticsRelationshipAggregate[];
  ratingHistory: AnalyticsRatingPoint[];
  ratingHistoryBounds: [number, number];
};

export type AggregatedAnalyticsFactsPayload = AnalyticsFactsBase & ({
  status: "updating";
} | {
  status: "ready";
  ratingVersion: string;
  current: { rating: number; rd: number; rank: number; rankedPlayerCount: number };
  currentWinStreak: number;
  periods: Record<AnalyticsPeriod, AggregatedAnalyticsPeriodFacts>;
});

export type PlayerAnalyticsViewModel = AnalyticsFactsBase & ({
  status: "updating";
} | {
  status: "ready";
  ratingVersion: string;
  historyPoints: Record<string, AnalyticsRatingPoint>;
  periods: Record<AnalyticsPeriod, AnalyticsPeriodSnapshot>;
});

const PERIODS: AnalyticsPeriod[] = ["all", "30d", "90d", "1y"];
const DAY_MS = 24 * 60 * 60 * 1000;

export function projectLegacyPlayerAnalytics(
  payload: LegacyAnalyticsFactsPayload,
): LegacyPlayerAnalyticsViewModel {
  const base = {
    asOf: payload.asOf,
    viewerUserId: payload.viewerUserId,
    subject: payload.subject,
    group: payload.group,
    availableGroups: payload.availableGroups,
  };
  if (payload.status === "updating") return { ...base, status: "updating" };

  return {
    ...base,
    status: "ready",
    periods: Object.fromEntries(PERIODS.map((period) => [
      period,
      projectPeriod(payload, period),
    ])) as Record<AnalyticsPeriod, LegacyAnalyticsPeriodSnapshot>,
  };
}

export function projectAggregatedPlayerAnalytics(
  payload: AggregatedAnalyticsFactsPayload,
): PlayerAnalyticsViewModel {
  const base = {
    asOf: payload.asOf,
    viewerUserId: payload.viewerUserId,
    subject: payload.subject,
    group: payload.group,
    availableGroups: payload.availableGroups,
  };
  if (payload.status === "updating") return { ...base, status: "updating" };

  const historyPoints: Record<string, AnalyticsRatingPoint> = {};
  const periods = Object.fromEntries(PERIODS.map((period) => {
    const facts = payload.periods[period];
    for (const point of facts.ratingHistory) {
      const existing = historyPoints[point.matchId];
      if (existing && !sameRatingPoint(existing, point)) {
        throw new Error(`Conflicting analytics chart point for match ${point.matchId}`);
      }
      historyPoints[point.matchId] = point;
    }

    return [period, {
      summary: {
        rank: payload.current.rank,
        rankedPlayerCount: payload.current.rankedPlayerCount,
        currentRating: Math.round(payload.current.rating),
        currentRd: payload.current.rd,
        ratingChange: round(facts.ratingDelta),
        wins: facts.wins,
        losses: facts.matchCount - facts.wins,
        winRate: facts.matchCount ? Math.round((facts.wins / facts.matchCount) * 100) : null,
      },
      flags: buildAggregatedFlags(payload, facts),
      matchups: buildMatchupsFromRelationships(facts.relationships),
      ratingHistoryPointIds: facts.ratingHistory.map((point) => point.matchId),
      ratingHistoryBounds: facts.ratingHistoryBounds,
    } satisfies AnalyticsPeriodSnapshot];
  })) as Record<AnalyticsPeriod, AnalyticsPeriodSnapshot>;

  return {
    ...base,
    status: "ready",
    ratingVersion: payload.ratingVersion,
    historyPoints,
    periods,
  };
}

export function sampleAnalyticsRatingPoints(
  input: AnalyticsRatingPoint[],
): AnalyticsRatingPoint[] {
  const points = [...input].sort(compareRatingPoints);
  if (points.length <= 200) return points;

  const selected = new Map<string, AnalyticsRatingPoint>();
  const retain = (point: AnalyticsRatingPoint) => selected.set(point.matchId, point);
  retain(points[0]);
  retain(points.at(-1)!);

  const interior = points.slice(1, -1);
  const buckets = Array.from({ length: 49 }, () => [] as AnalyticsRatingPoint[]);
  interior.forEach((point, index) => {
    buckets[Math.floor(index * 49 / interior.length)].push(point);
  });

  for (const bucket of buckets) {
    if (!bucket.length) continue;
    retain(extreme(bucket, (point) => point.rating, "min"));
    retain(extreme(bucket, (point) => point.rating, "max"));
    retain(extreme(bucket, (point) => point.rating - point.performanceSd, "min"));
    retain(extreme(bucket, (point) => point.rating + point.performanceSd, "max"));
  }

  return [...selected.values()].sort(compareRatingPoints);
}

function sameRatingPoint(left: AnalyticsRatingPoint, right: AnalyticsRatingPoint) {
  return left.matchId === right.matchId
    && left.occurredAt === right.occurredAt
    && left.rating === right.rating
    && left.rd === right.rd
    && left.performanceSd === right.performanceSd
    && left.ratingDelta === right.ratingDelta;
}

function compareRatingPoints(left: AnalyticsRatingPoint, right: AnalyticsRatingPoint) {
  return Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
    || left.matchId.localeCompare(right.matchId);
}

function extreme(
  points: AnalyticsRatingPoint[],
  score: (point: AnalyticsRatingPoint) => number,
  direction: "min" | "max",
) {
  return [...points].sort((left, right) => {
    const scoreOrder = direction === "min"
      ? score(left) - score(right)
      : score(right) - score(left);
    return scoreOrder || compareRatingPoints(left, right);
  })[0];
}

function projectPeriod(
  payload: Extract<LegacyAnalyticsFactsPayload, { status: "ready" }>,
  period: AnalyticsPeriod,
) {
  const matches = payload.matches
    .filter((item) => inPeriod(item.occurredAt, period, payload.asOf))
    .sort(compareMatches);
  const wins = matches.filter((item) => item.matchWon).length;
  const gameCount = sum(matches.map((item) => item.gameCount));
  const gameWins = sum(matches.map((item) => item.gameWins));
  const expectedGameWins = sum(matches.map((item) => item.expectedGameWins));
  const ratingChange = round(sum(matches.map((item) => item.ratingDelta)));
  const cohort = aggregateCohort(payload.cohortDaily.filter((item) => inPeriod(item.statDate, period, payload.asOf)));
  const partnerCounts = aggregateCohortPartners(
    payload.cohortPartners.filter((item) => inPeriod(item.statDate, period, payload.asOf)),
  );

  return {
    summary: {
      rank: payload.current.rank,
      rankedPlayerCount: payload.current.rankedPlayerCount,
      currentRating: Math.round(payload.current.rating),
      currentRd: payload.current.rd,
      ratingChange,
      wins,
      losses: matches.length - wins,
      winRate: matches.length ? Math.round((wins / matches.length) * 100) : null,
    },
    ratingHistory: matches.map((item) => ({
      matchId: item.id,
      occurredAt: item.occurredAt,
      rating: Math.round(item.ratingAfter),
      rd: item.rdAfter,
      performanceSd: item.performanceSdAfter,
      ratingDelta: round(item.ratingDelta),
    })),
    flags: buildFlags({ payload, matches, cohort, partnerCounts, gameCount, gameWins, expectedGameWins }),
    matchups: buildMatchups(matches),
  } satisfies LegacyAnalyticsPeriodSnapshot;
}

function buildFlags({
  payload,
  matches,
  cohort,
  partnerCounts,
  gameCount,
  gameWins,
  expectedGameWins,
}: {
  payload: Extract<LegacyAnalyticsFactsPayload, { status: "ready" }>;
  matches: AnalyticsMatchFact[];
  cohort: Map<string, { matchCount: number; ratingDelta: number; doublesMatchCount: number }>;
  partnerCounts: Map<string, number>;
  gameCount: number;
  gameWins: number;
  expectedGameWins: number;
}) {
  const flags: AnalyticsFlag[] = [];
  const streak = currentWinStreak(payload.matches);
  if (streak >= 4) flags.push(flag("hot-streak", "Hot Streak", `Won the last ${streak} matches.`));

  const activePeers = payload.activePlayerIds.filter((id) => id !== payload.subject.id);
  const encountered = new Set(matches.flatMap((item) => [...item.partners, ...item.opponents]).map((person) => person.id));
  const encounteredActive = activePeers.filter((id) => encountered.has(id)).length;
  if (activePeers.length && encounteredActive / activePeers.length >= 0.6) {
    flags.push(flag("social-butterfly", "Social Butterfly", `Played with or against ${encounteredActive} of ${activePeers.length} active players.`));
  }

  const upsetWins = matches.filter((item) => item.matchWon && item.gameCount > 0 && item.expectedGameWins / item.gameCount <= 0.35).length;
  if (upsetWins >= 3) flags.push(flag("giant-slayer", "Giant Slayer", `Won ${upsetWins} matches despite being the clear underdog.`));

  const expectedRate = gameCount ? expectedGameWins / gameCount : 0;
  if (matches.length >= 5 && expectedRate < 0.4) {
    flags.push(flag("tough-schedule", "Tough Schedule", `Faced tougher-than-average competition across the last ${matches.length} matches.`));
  }

  const subjectCohort = cohort.get(payload.subject.id) ?? { matchCount: matches.length, ratingDelta: sum(matches.map((item) => item.ratingDelta)), doublesMatchCount: matches.filter((item) => item.format === "doubles").length };
  const activeCohort = payload.activePlayerIds.map((id) => cohort.get(id)).filter(isDefined);
  if (activeCohort.length && subjectCohort.matchCount >= percentile(activeCohort.map((item) => item.matchCount), 0.8)) {
    flags.push(flag("very-active", "Very Active", `Played ${subjectCohort.matchCount} matches, ranking among the group’s most active players.`));
  }

  const climbers = activeCohort.filter((item) => item.matchCount >= 5);
  const roundedRatingGain = Math.round(subjectCohort.ratingDelta);
  if (subjectCohort.matchCount >= 5 && roundedRatingGain >= 1 && climbers.length && subjectCohort.ratingDelta >= percentile(climbers.map((item) => item.ratingDelta), 0.8)) {
    flags.push(flag("fast-climber", "Fast Climber", `Gained ${roundedRatingGain} rating points in this period.`));
  }

  const actualRate = gameCount ? gameWins / gameCount : 0;
  if (matches.length >= 5 && actualRate - expectedRate >= 0.1) {
    flags.push(flag("overperformer", "Overperformer", `Won ${percent(actualRate)} of games when matchups predicted a ${percent(expectedRate)} win rate.`));
  }

  const residuals = matches.map((item) => item.gameCount ? (item.gameWins - item.expectedGameWins) / item.gameCount : 0);
  if (matches.length >= 8 && standardDeviation(residuals) <= 0.2 && Math.abs(average(residuals)) < 0.1) {
    flags.push(flag("consistent", "Consistent", `Results closely matched expected performance across ${matches.length} matches.`));
  }

  if (payload.current.rank === 1) flags.push(flag("group-leader", "Group Leader", `Currently ranked #1 in ${payload.group.name}.`));

  const subjectPartners = partnerCounts.get(payload.subject.id) ?? 0;
  const doublesPlayers = payload.activePlayerIds
    .filter((id) => (cohort.get(id)?.doublesMatchCount ?? 0) >= 3)
    .map((id) => partnerCounts.get(id) ?? 0);
  if (subjectPartners >= 5 && doublesPlayers.length && subjectPartners >= percentile(doublesPlayers, 0.75)) {
    flags.push(flag("team-player", "Team Player", `Partnered with ${subjectPartners} different players in this period.`));
  }

  if (matches.length >= 8 && matches.filter((item) => item.matchWon).length / matches.length >= 0.75 && actualRate >= expectedRate) {
    flags.push(flag("dominant", "Dominant", `Won ${matches.filter((item) => item.matchWon).length} of ${matches.length} matches.`));
  }
  return flags;
}

function buildAggregatedFlags(
  payload: Extract<AggregatedAnalyticsFactsPayload, { status: "ready" }>,
  facts: AggregatedAnalyticsPeriodFacts,
) {
  const flags: AnalyticsFlag[] = [];
  if (payload.currentWinStreak >= 4) {
    flags.push(flag("hot-streak", "Hot Streak", `Won the last ${payload.currentWinStreak} matches.`));
  }

  if (facts.activePeerCount && facts.encounteredActiveCount / facts.activePeerCount >= 0.6) {
    flags.push(flag(
      "social-butterfly",
      "Social Butterfly",
      `Played with or against ${facts.encounteredActiveCount} of ${facts.activePeerCount} active players.`,
    ));
  }

  if (facts.upsetWins >= 3) {
    flags.push(flag(
      "giant-slayer",
      "Giant Slayer",
      `Won ${facts.upsetWins} matches despite being the clear underdog.`,
    ));
  }

  const expectedRate = facts.gameCount ? facts.expectedGameWins / facts.gameCount : 0;
  if (facts.matchCount >= 5 && expectedRate < 0.4) {
    flags.push(flag(
      "tough-schedule",
      "Tough Schedule",
      `Faced tougher-than-average competition across the last ${facts.matchCount} matches.`,
    ));
  }

  const subjectCohort = facts.cohort.find((item) => item.userId === payload.subject.id) ?? {
    userId: payload.subject.id,
    matchCount: facts.matchCount,
    ratingDelta: facts.ratingDelta,
    doublesMatchCount: 0,
    distinctPartnerCount: 0,
  };
  const activeCohort = facts.cohort.filter((item) => item.matchCount > 0);
  if (
    activeCohort.length
    && subjectCohort.matchCount >= percentile(activeCohort.map((item) => item.matchCount), 0.8)
  ) {
    flags.push(flag(
      "very-active",
      "Very Active",
      `Played ${subjectCohort.matchCount} matches, ranking among the group’s most active players.`,
    ));
  }

  const climbers = activeCohort.filter((item) => item.matchCount >= 5);
  const roundedRatingGain = Math.round(subjectCohort.ratingDelta);
  if (
    subjectCohort.matchCount >= 5
    && roundedRatingGain >= 1
    && climbers.length
    && subjectCohort.ratingDelta >= percentile(climbers.map((item) => item.ratingDelta), 0.8)
  ) {
    flags.push(flag(
      "fast-climber",
      "Fast Climber",
      `Gained ${roundedRatingGain} rating points in this period.`,
    ));
  }

  const actualRate = facts.gameCount ? facts.gameWins / facts.gameCount : 0;
  if (facts.matchCount >= 5 && actualRate - expectedRate >= 0.1) {
    flags.push(flag(
      "overperformer",
      "Overperformer",
      `Won ${percent(actualRate)} of games when matchups predicted a ${percent(expectedRate)} win rate.`,
    ));
  }

  const residualMean = facts.residualCount ? facts.residualSum / facts.residualCount : 0;
  const residualVariance = facts.residualCount
    ? Math.max(0, facts.residualSumSquares / facts.residualCount - residualMean ** 2)
    : 0;
  if (
    facts.matchCount >= 8
    && Math.sqrt(residualVariance) <= 0.2
    && Math.abs(residualMean) < 0.1
  ) {
    flags.push(flag(
      "consistent",
      "Consistent",
      `Results closely matched expected performance across ${facts.matchCount} matches.`,
    ));
  }

  if (payload.current.rank === 1) {
    flags.push(flag("group-leader", "Group Leader", `Currently ranked #1 in ${payload.group.name}.`));
  }

  const doublesPlayers = activeCohort
    .filter((item) => item.doublesMatchCount >= 3)
    .map((item) => item.distinctPartnerCount);
  if (
    subjectCohort.distinctPartnerCount >= 5
    && doublesPlayers.length
    && subjectCohort.distinctPartnerCount >= percentile(doublesPlayers, 0.75)
  ) {
    flags.push(flag(
      "team-player",
      "Team Player",
      `Partnered with ${subjectCohort.distinctPartnerCount} different players in this period.`,
    ));
  }

  if (
    facts.matchCount >= 8
    && facts.wins / facts.matchCount >= 0.75
    && actualRate >= expectedRate
  ) {
    flags.push(flag(
      "dominant",
      "Dominant",
      `Won ${facts.wins} of ${facts.matchCount} matches.`,
    ));
  }
  return flags;
}

type Relationship = AnalyticsRelationshipAggregate;

function buildMatchups(matches: AnalyticsMatchFact[]) {
  return buildMatchupsFromRelationships(aggregateRelationships(matches));
}

function buildMatchupsFromRelationships(aggregates: AnalyticsRelationshipAggregate[]) {
  const relationships = aggregates.filter((item) => item.matches >= 3);
  const partners = relationships.filter((item) => item.kind === "partner");
  const opponents = relationships.filter((item) => item.kind === "opponent");
  const insights: MatchupInsight[] = [];

  const bestPartner = sortRelationships(partners, (item) => -performance(item))[0];
  if (bestPartner) {
    insights.push(insight(
      "best-partner",
      "Best Partner",
      bestPartner,
      bestPartnerDescription(bestPartner),
    ));
  }

  const closestRival = [...opponents].sort((left, right) =>
    Math.abs(winRate(left) - 0.5) - Math.abs(winRate(right) - 0.5)
    || right.matches - left.matches
    || Math.abs(expectedRate(left) - 0.5) - Math.abs(expectedRate(right) - 0.5)
    || stableRelationshipOrder(left, right))[0];
  if (closestRival) {
    insights.push(insight(
      "closest-rival",
      "Closest Rival",
      closestRival,
      `${record(closestRival)} head-to-head · ${percent(winRate(closestRival))} win rate`,
    ));
  }

  const nemesis = sortRelationships(
    opponents.filter((item) => underperformancePercent(item) >= 1),
    performance,
  )[0];
  if (nemesis) {
    insights.push(insight(
      "nemesis",
      "Nemesis",
      nemesis,
      `${record(nemesis)} head-to-head · ${underperformancePercent(nemesis)}% worse than expected`,
    ));
  }

  const frequentPartner = sortRelationships(partners, (item) => -item.matches)[0];
  if (frequentPartner) {
    insights.push(insight(
      "most-frequent-partner",
      "Most Frequent Partner",
      frequentPartner,
      `Played ${frequentPartner.matches} matches together, winning ${frequentPartner.wins} for a win rate of ${percent(winRate(frequentPartner))}.`,
    ));
  }

  const frequentOpponent = sortRelationships(opponents, (item) => -item.matches)[0];
  if (frequentOpponent) {
    insights.push(insight(
      "most-frequent-opponent",
      "Most Frequent Opponent",
      frequentOpponent,
      `Played ${frequentOpponent.gameCount} games against this opponent.`,
    ));
  }
  return insights;
}

function aggregateRelationships(matches: AnalyticsMatchFact[]) {
  const aggregated = new Map<string, Relationship>();
  for (const item of matches) {
    for (const [kind, people] of [["partner", item.partners], ["opponent", item.opponents]] as const) {
      for (const player of people) {
        const key = `${kind}:${player.id}`;
        const current = aggregated.get(key) ?? { player, kind, matches: 0, wins: 0, gameCount: 0, gameWins: 0, expectedGameWins: 0 };
        current.matches += 1;
        current.wins += item.matchWon ? 1 : 0;
        current.gameCount += item.gameCount;
        current.gameWins += item.gameWins;
        current.expectedGameWins += item.expectedGameWins;
        aggregated.set(key, current);
      }
    }
  }
  return [...aggregated.values()];
}

function insight(
  key: MatchupInsightKey,
  label: string,
  relationship: Relationship,
  description: string,
): MatchupInsight {
  return {
    key,
    label,
    player: relationship.player,
    description,
  };
}

function bestPartnerDescription(relationship: Relationship) {
  const result = `Won ${relationship.wins} of ${relationship.matches} matches together`;
  const underdog = expectedRate(relationship) < 0.5 ? " when predicted to lose" : "";
  const ratingDifference = ratingEquivalentPerformance(relationship);

  if (ratingDifference > 0) {
    return `${result}${underdog}, performing as though rated ${ratingDifference} points higher.`;
  }
  if (ratingDifference < 0) {
    return `${result}${underdog}, performing as though rated ${Math.abs(ratingDifference)} points lower.`;
  }
  return `${result}${underdog}, performing in line with expectations.`;
}

function ratingEquivalentPerformance(relationship: Relationship) {
  const observedRate = relationship.gameCount
    ? (relationship.gameWins + 1) / (relationship.gameCount + 2)
    : 0.5;
  return Math.round(ratingGap(observedRate) - ratingGap(expectedRate(relationship)));
}

function ratingGap(rate: number) {
  const boundedRate = Math.min(0.99, Math.max(0.01, rate));
  return 400 * Math.log10(boundedRate / (1 - boundedRate));
}

function record(relationship: Relationship) {
  return `${relationship.wins}–${relationship.matches - relationship.wins}`;
}

function flag(key: AnalyticsFlagKey, label: string, explanation: string): AnalyticsFlag {
  return { key, label, explanation };
}

function aggregateCohort(rows: AnalyticsCohortDailyFact[]) {
  const result = new Map<string, { matchCount: number; ratingDelta: number; doublesMatchCount: number }>();
  for (const row of rows) {
    const current = result.get(row.userId) ?? { matchCount: 0, ratingDelta: 0, doublesMatchCount: 0 };
    current.matchCount += row.matchCount;
    current.ratingDelta += row.ratingDelta;
    current.doublesMatchCount += row.doublesMatchCount;
    result.set(row.userId, current);
  }
  return result;
}

function aggregateCohortPartners(rows: AnalyticsCohortPartnerFact[]) {
  const unique = new Map<string, Set<string>>();
  for (const row of rows) {
    const partners = unique.get(row.userId) ?? new Set<string>();
    partners.add(row.relatedUserId);
    unique.set(row.userId, partners);
  }
  return new Map([...unique].map(([userId, partners]) => [userId, partners.size]));
}

function currentWinStreak(matches: AnalyticsMatchFact[]) {
  let streak = 0;
  for (const item of [...matches].sort(compareMatches).reverse()) {
    if (!item.matchWon) break;
    streak += 1;
  }
  return streak;
}

function inPeriod(value: string, period: AnalyticsPeriod, asOf: string) {
  if (period === "all") return true;
  const days = period === "30d" ? 30 : period === "90d" ? 90 : 365;
  return Date.parse(value) >= Date.parse(asOf) - days * DAY_MS;
}

function compareMatches(left: AnalyticsMatchFact, right: AnalyticsMatchFact) {
  return Date.parse(left.occurredAt) - Date.parse(right.occurredAt) || left.id.localeCompare(right.id);
}

function sortRelationships(items: Relationship[], score: (item: Relationship) => number) {
  return [...items].sort((left, right) => score(left) - score(right) || right.matches - left.matches || stableRelationshipOrder(left, right));
}

function stableRelationshipOrder(left: Relationship, right: Relationship) {
  return left.player.name.localeCompare(right.player.name) || left.player.id.localeCompare(right.player.id);
}

function performance(item: Relationship) {
  return item.gameCount ? (item.gameWins - item.expectedGameWins) / item.gameCount : 0;
}

function underperformancePercent(item: Relationship) {
  return Math.max(0, Math.round(-performance(item) * 100));
}

function winRate(item: Relationship) {
  return item.matches ? item.wins / item.matches : 0;
}

function expectedRate(item: Relationship) {
  return item.gameCount ? item.expectedGameWins / item.gameCount : 0;
}

function percentile(values: number[], target: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(target * sorted.length) - 1)] ?? Number.POSITIVE_INFINITY;
}

function average(values: number[]) {
  return values.length ? sum(values) / values.length : 0;
}

function standardDeviation(values: number[]) {
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
