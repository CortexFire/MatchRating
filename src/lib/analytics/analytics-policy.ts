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
  | "most-frequent-opponent"
  | "toughest-competitive-matchup";

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
  ratingAfter: number;
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

export type AnalyticsFactsPayload = AnalyticsFactsBase & ({
  status: "updating";
} | {
  status: "ready";
  current: { rating: number; rank: number; rankedPlayerCount: number };
  activePlayerIds: string[];
  matches: AnalyticsMatchFact[];
  cohortDaily: AnalyticsCohortDailyFact[];
  cohortPartners: AnalyticsCohortPartnerFact[];
});

export type AnalyticsSummary = {
  rank: number;
  rankedPlayerCount: number;
  currentRating: number;
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
  primaryStat: string;
  secondaryStat?: string;
};

export type AnalyticsPeriodSnapshot = {
  summary: AnalyticsSummary;
  ratingHistory: Array<{
    matchId: string;
    occurredAt: string;
    rating: number;
    ratingDelta: number;
  }>;
  flags: AnalyticsFlag[];
  matchups: MatchupInsight[];
};

export type PlayerAnalyticsViewModel = AnalyticsFactsBase & ({
  status: "updating";
} | {
  status: "ready";
  periods: Record<AnalyticsPeriod, AnalyticsPeriodSnapshot>;
});

const PERIODS: AnalyticsPeriod[] = ["all", "30d", "90d", "1y"];
const DAY_MS = 24 * 60 * 60 * 1000;

export function projectPlayerAnalytics(payload: AnalyticsFactsPayload): PlayerAnalyticsViewModel {
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
    ])) as Record<AnalyticsPeriod, AnalyticsPeriodSnapshot>,
  };
}

function projectPeriod(payload: Extract<AnalyticsFactsPayload, { status: "ready" }>, period: AnalyticsPeriod) {
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
      ratingChange,
      wins,
      losses: matches.length - wins,
      winRate: matches.length ? Math.round((wins / matches.length) * 100) : null,
    },
    ratingHistory: matches.map((item) => ({
      matchId: item.id,
      occurredAt: item.occurredAt,
      rating: Math.round(item.ratingAfter),
      ratingDelta: round(item.ratingDelta),
    })),
    flags: buildFlags({ payload, matches, cohort, partnerCounts, gameCount, gameWins, expectedGameWins }),
    matchups: buildMatchups(matches),
  } satisfies AnalyticsPeriodSnapshot;
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
  payload: Extract<AnalyticsFactsPayload, { status: "ready" }>;
  matches: AnalyticsMatchFact[];
  cohort: Map<string, { matchCount: number; ratingDelta: number; doublesMatchCount: number }>;
  partnerCounts: Map<string, number>;
  gameCount: number;
  gameWins: number;
  expectedGameWins: number;
}) {
  const flags: AnalyticsFlag[] = [];
  const streak = currentWinStreak(payload.matches);
  if (streak >= 4) flags.push(flag("hot-streak", "Hot Streak", `Won your last ${streak} matches.`));

  const activePeers = payload.activePlayerIds.filter((id) => id !== payload.subject.id);
  const encountered = new Set(matches.flatMap((item) => [...item.partners, ...item.opponents]).map((person) => person.id));
  const encounteredActive = activePeers.filter((id) => encountered.has(id)).length;
  if (activePeers.length && encounteredActive / activePeers.length >= 0.6) {
    flags.push(flag("social-butterfly", "Social Butterfly", `Played with or against ${encounteredActive} of ${activePeers.length} active players.`));
  }

  const upsetWins = matches.filter((item) => item.matchWon && item.gameCount > 0 && item.expectedGameWins / item.gameCount <= 0.35).length;
  if (upsetWins >= 3) flags.push(flag("giant-slayer", "Giant Slayer", `Won ${upsetWins} matches with a 35% or lower expected score.`));

  const expectedRate = gameCount ? expectedGameWins / gameCount : 0;
  if (matches.length >= 5 && expectedRate < 0.4) {
    flags.push(flag("tough-schedule", "Tough Schedule", `Your expected score was ${percent(expectedRate)} across ${matches.length} matches.`));
  }

  const subjectCohort = cohort.get(payload.subject.id) ?? { matchCount: matches.length, ratingDelta: sum(matches.map((item) => item.ratingDelta)), doublesMatchCount: matches.filter((item) => item.format === "doubles").length };
  const activeCohort = payload.activePlayerIds.map((id) => cohort.get(id)).filter(isDefined);
  if (activeCohort.length && subjectCohort.matchCount >= percentile(activeCohort.map((item) => item.matchCount), 0.8)) {
    flags.push(flag("very-active", "Very Active", `Played ${subjectCohort.matchCount} matches, placing you among the group's most active players.`));
  }

  const climbers = activeCohort.filter((item) => item.matchCount >= 5);
  if (subjectCohort.matchCount >= 5 && climbers.length && subjectCohort.ratingDelta >= percentile(climbers.map((item) => item.ratingDelta), 0.8)) {
    flags.push(flag("fast-climber", "Fast Climber", `Gained ${formatSigned(round(subjectCohort.ratingDelta))} rating points in this period.`));
  }

  const actualRate = gameCount ? gameWins / gameCount : 0;
  if (matches.length >= 5 && actualRate - expectedRate >= 0.1) {
    flags.push(flag("overperformer", "Overperformer", `Won ${percent(actualRate)} of games versus an expected ${percent(expectedRate)}.`));
  }

  const residuals = matches.map((item) => item.gameCount ? (item.gameWins - item.expectedGameWins) / item.gameCount : 0);
  if (matches.length >= 8 && standardDeviation(residuals) <= 0.2 && Math.abs(average(residuals)) < 0.1) {
    flags.push(flag("consistent", "Consistent", "Recent results have closely matched expected performance."));
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

type Relationship = {
  player: AnalyticsPerson;
  kind: "partner" | "opponent";
  matches: number;
  wins: number;
  gameCount: number;
  gameWins: number;
  expectedGameWins: number;
};

function buildMatchups(matches: AnalyticsMatchFact[]) {
  const relationships = aggregateRelationships(matches).filter((item) => item.matches >= 3);
  const partners = relationships.filter((item) => item.kind === "partner");
  const opponents = relationships.filter((item) => item.kind === "opponent");
  const insights: MatchupInsight[] = [];

  const bestPartner = sortRelationships(partners, (item) => -performance(item))[0];
  if (bestPartner) insights.push(insight("best-partner", "Best Partner", bestPartner, "together"));

  const closestRival = [...opponents].sort((left, right) =>
    Math.abs(winRate(left) - 0.5) - Math.abs(winRate(right) - 0.5)
    || right.matches - left.matches
    || Math.abs(expectedRate(left) - 0.5) - Math.abs(expectedRate(right) - 0.5)
    || stableRelationshipOrder(left, right))[0];
  if (closestRival) insights.push(insight("closest-rival", "Closest Rival", closestRival));

  const nemesis = sortRelationships(opponents, performance)[0];
  if (nemesis) insights.push(insight("nemesis", "Nemesis", nemesis));

  const frequentPartner = sortRelationships(partners, (item) => -item.matches)[0];
  if (frequentPartner) insights.push(insight("most-frequent-partner", "Most Frequent Partner", frequentPartner, "together"));

  const frequentOpponent = sortRelationships(opponents, (item) => -item.matches)[0];
  if (frequentOpponent) insights.push(insight("most-frequent-opponent", "Most Frequent Opponent", frequentOpponent));

  const toughest = sortRelationships(
    opponents.filter((item) => winRate(item) >= 0.25 && winRate(item) < 0.5 && performance(item) < 0),
    performance,
  )[0];
  if (toughest) insights.push(insight("toughest-competitive-matchup", "Toughest Competitive Matchup", toughest));
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

function insight(key: MatchupInsightKey, label: string, relationship: Relationship, suffix = "head-to-head"): MatchupInsight {
  return {
    key,
    label,
    player: relationship.player,
    primaryStat: `${relationship.wins}–${relationship.matches - relationship.wins} ${suffix}`,
    secondaryStat: `${formatSigned(Math.round(performance(relationship) * 100))}% vs expected`,
  };
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

function formatSigned(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
