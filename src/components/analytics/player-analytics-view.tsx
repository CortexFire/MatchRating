"use client";

import dynamic from "next/dynamic";
import { type ReactNode, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { MobileShell } from "@/components/app/mobile-shell";
import { ScreenHeader } from "@/components/app/screen-header";
import { RatingValue } from "@/components/ratings/rating-value";
import {
  type AnalyticsPeriod,
  type AnalyticsPeriodSnapshot,
  type AnalyticsRatingPoint,
  type PlayerAnalyticsViewModel,
} from "@/lib/analytics/analytics-policy";
import { DeferredPlayerHistory } from "./deferred-player-history";
import styles from "./player-analytics-view.module.css";

const RatingHistoryChart = dynamic(() => import("./rating-history-chart").then((module) => module.RatingHistoryChart), {
  loading: () => <p className={styles.chartLoading} role="status">Loading rating chart…</p>,
});

const PERIODS: Array<{ key: AnalyticsPeriod; label: string }> = [
  { key: "all", label: "All" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "1y", label: "1 year" },
];

export function PlayerAnalyticsView({ model }: { model: PlayerAnalyticsViewModel }) {
  const router = useRouter();
  const [period, setPeriod] = useState<AnalyticsPeriod>("all");
  const [expandedFlag, setExpandedFlag] = useState<string | null>(null);
  const recordHref = `/groups/${model.group.id}/matches/new`;

  function changeGroup(groupId: string) {
    if (groupId !== model.group.id) {
      router.push(`/groups/${groupId}/players/${model.subject.id}/analytics`);
    }
  }

  const groupSelector = (
    <label className={styles.groupSelector}>
      <span className={styles.srOnly}>Selected group</span>
      <select
        aria-label={`Current group ${model.group.name}`}
        value={model.group.id}
        disabled={model.availableGroups.length <= 1}
        onChange={(event) => changeGroup(event.target.value)}
      >
        {model.availableGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
      </select>
      {model.availableGroups.length > 1 ? <ChevronDown aria-hidden="true" className={styles.selectArrow} /> : null}
    </label>
  );

  return (
    <MobileShell active="Groups" recordHref={recordHref} surfaceClassName={styles.analyticsShell}>
      <ScreenHeader title="Analytics" subtitle={model.subject.name} action={groupSelector} />
      {model.status === "updating" ? (
        <section className={styles.statusCard} role="status" aria-live="polite">
          <h2>Analytics are updating</h2>
          <p>Ratings are current, but performance insights will appear after the analytics projection finishes.</p>
        </section>
      ) : (
        <AnalyticsContent
          model={model}
          snapshot={model.periods[period]}
          period={period}
          onPeriodChange={(nextPeriod) => {
            setPeriod(nextPeriod);
            setExpandedFlag(null);
          }}
          expandedFlag={expandedFlag}
          onFlagToggle={(key) => setExpandedFlag((current) => current === key ? null : key)}
        />
      )}
      <DeferredPlayerHistory
        key={`${model.group.id}:${model.subject.id}`}
        groupId={model.group.id}
        playerId={model.subject.id}
        playerName={model.subject.name}
      />
    </MobileShell>
  );
}

function AnalyticsContent({
  model,
  snapshot,
  period,
  onPeriodChange,
  expandedFlag,
  onFlagToggle,
}: {
  model: Extract<PlayerAnalyticsViewModel, { status: "ready" }>;
  snapshot: AnalyticsPeriodSnapshot;
  period: AnalyticsPeriod;
  onPeriodChange: (period: AnalyticsPeriod) => void;
  expandedFlag: string | null;
  onFlagToggle: (key: string) => void;
}) {
  const router = useRouter();
  const points = useMemo(() => snapshot.ratingHistoryPointIds
    .slice(0, 200)
    .map((matchId: string) => model.historyPoints[matchId])
    .filter((point: AnalyticsRatingPoint | undefined): point is AnalyticsRatingPoint => point !== undefined), [model.historyPoints, snapshot.ratingHistoryPointIds]);

  return (
    <>
      <section className={styles.historySection} aria-labelledby="rating-history-title">
        <h2 id="rating-history-title" className={styles.srOnly}>Rating History</h2>
        <div className={styles.periodSelector} aria-label="Analytics period filter">
          <span className={styles.filterLabel}>Filter</span>
          {PERIODS.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={period === item.key}
              className={period === item.key ? styles.periodActive : undefined}
              onClick={() => onPeriodChange(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {points.length ? (
          <RatingHistoryChart
            key={`${model.group.id}:${model.subject.id}:${period}:${model.asOf}:${model.ratingVersion}`}
            points={points}
            bounds={snapshot.ratingHistoryBounds}
            groupId={model.group.id}
            playerId={model.subject.id}
            period={period}
            asOf={model.asOf}
            ratingVersion={model.ratingVersion}
            onRatingVersionConflict={() => router.refresh()}
          />
        ) : <p className={styles.chartEmpty}>No completed matches in this period.</p>}
      </section>

      <section className={styles.summaryGrid} aria-label="Player summary">
        <SummaryCard primary={`#${snapshot.summary.rank}`} secondary={`of ${snapshot.summary.rankedPlayerCount}`} label="Group Rank" />
        <SummaryCard
          primary={snapshot.summary.winRate === null ? "—" : `${snapshot.summary.winRate}%`}
          secondary={`${snapshot.summary.wins}–${snapshot.summary.losses}`}
          label="Win Rate"
        />
        <SummaryCard
          primary={<RatingValue rating={snapshot.summary.currentRating} rd={snapshot.summary.currentRd} />}
          secondary={formatSigned(snapshot.summary.ratingChange)}
          label="Current Rating"
        />
      </section>

      {snapshot.flags.length ? (
        <section className={styles.flagSection} aria-label="Player flags">
          <div className={styles.flagGrid}>
            {snapshot.flags.map((item) => {
              const expanded = expandedFlag === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={styles.flagButton}
                  aria-expanded={expanded}
                  aria-controls={`flag-${item.key}`}
                  onClick={() => onFlagToggle(item.key)}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          {snapshot.flags.map((item) => expandedFlag === item.key ? (
            <p key={item.key} id={`flag-${item.key}`} className={styles.flagExplanation}>{item.explanation}</p>
          ) : null)}
        </section>
      ) : null}

      <section className={styles.matchupSection} aria-labelledby="group-dynamics-title">
        <h2 id="group-dynamics-title">Group Dynamics</h2>
        {snapshot.matchups.length ? (
          <div className={styles.matchupList}>
            {snapshot.matchups.map((item) => (
              <article key={item.key} className={styles.matchupCard}>
                <h3>{item.label}</h3>
                <p className={styles.matchupPlayer}>{item.player.name}</p>
                <p className={styles.matchupStats}>{item.description}</p>
              </article>
            ))}
          </div>
        ) : <p className={styles.emptyState}>Group dynamics will appear after at least 3 shared matches.</p>}
      </section>
    </>
  );
}

function SummaryCard({ primary, secondary, label }: { primary: ReactNode; secondary: string; label: string }) {
  return (
    <article className={styles.summaryCard} aria-label={label}>
      <strong>{primary}</strong>
      <span className={styles.summarySecondary}>{secondary}</span>
      <span className={styles.summaryLabel}>{label}</span>
    </article>
  );
}

function formatSigned(value: number) {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return "0";
}
