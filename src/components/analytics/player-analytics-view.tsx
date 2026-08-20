"use client";

import { type ReactNode, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MobileShell } from "@/components/app/mobile-shell";
import { ScreenHeader } from "@/components/app/screen-header";
import { RatingValue } from "@/components/ratings/rating-value";
import {
  type AnalyticsPeriod,
  type AnalyticsPeriodSnapshot,
  type PlayerAnalyticsViewModel,
} from "@/lib/analytics/analytics-policy";
import { formatRating } from "@/lib/ratings/rating-display";
import styles from "./player-analytics-view.module.css";

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
    </MobileShell>
  );
}

function AnalyticsContent({
  snapshot,
  period,
  onPeriodChange,
  expandedFlag,
  onFlagToggle,
}: {
  snapshot: AnalyticsPeriodSnapshot;
  period: AnalyticsPeriod;
  onPeriodChange: (period: AnalyticsPeriod) => void;
  expandedFlag: string | null;
  onFlagToggle: (key: string) => void;
}) {
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
        <RatingHistoryChart snapshot={snapshot} />
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

function RatingHistoryChart({ snapshot }: { snapshot: AnalyticsPeriodSnapshot }) {
  const points = snapshot.ratingHistory;
  const [selectedMatchId, setSelectedMatchId] = useState(points.at(-1)?.matchId ?? "");
  const selected = useMemo(
    () => points.find((point) => point.matchId === selectedMatchId) ?? points.at(-1),
    [points, selectedMatchId],
  );

  if (!points.length) return <p className={styles.chartEmpty}>No completed matches in this period.</p>;
  const selectedValue = selected?.matchId ?? points.at(-1)?.matchId ?? "";
  const chartData = points.map((point, index) => ({
    ...point,
    latestRating: index === points.length - 1 ? point.rating : null,
  }));

  return (
    <div className={styles.chartWrap}>
      <div className={styles.chart} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 12, right: 10, bottom: 0, left: -18 }}>
            <CartesianGrid vertical={false} stroke="var(--stroke)" strokeDasharray="3 3" />
            <XAxis dataKey="occurredAt" tickFormatter={shortDate} tick={{ fill: "var(--muted)", fontSize: 10 }} minTickGap={24} />
            <YAxis domain={["dataMin - 20", "dataMax + 20"]} tick={{ fill: "var(--muted)", fontSize: 10 }} width={48} />
            <Tooltip
              labelFormatter={(value) => longDate(String(value))}
              formatter={(value, _name, item) => [
                `${formatRating(Number(value), Number(item.payload.rd))} (${formatSigned(Number(item.payload.ratingDelta))})`,
                "Rating",
              ]}
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--stroke)", borderRadius: 8, fontSize: 12 }}
            />
            <Line type="monotone" dataKey="rating" stroke="var(--action)" strokeWidth={3} dot={{ r: 3, fill: "var(--surface)", strokeWidth: 2 }} activeDot={{ r: 5 }} />
            <Line
              type="monotone"
              dataKey="latestRating"
              stroke="transparent"
              dot={{ r: 6, fill: "var(--action)", stroke: "var(--surface)", strokeWidth: 2 }}
              activeDot={false}
              connectNulls={false}
              tooltipType="none"
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className={styles.chartInspector}>
        <label>
          <span>Inspect match</span>
          <select aria-label="Inspect rating point" value={selectedValue} onChange={(event) => setSelectedMatchId(event.target.value)}>
          {points.map((point) => <option key={point.matchId} value={point.matchId}>{longDate(point.occurredAt)}</option>)}
          </select>
        </label>
        <p role="status" aria-label="Selected rating point" aria-live="polite">
          {selected ? `${longDate(selected.occurredAt)}: rating ${formatRating(selected.rating, selected.rd)}, change ${formatSigned(selected.ratingDelta)}` : ""}
        </p>
      </div>
    </div>
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

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function longDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(value));
}
