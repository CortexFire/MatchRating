"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { type GroupRatingHistoryData, type GroupRatingHistorySeries } from "@/lib/navigation-read-models";
import styles from "./group-rating-history-chart.module.css";

const PLAYER_LIMITS = [3, 5, 10] as const;
const SERIES_COLORS = Array.from({ length: 10 }, (_, index) => `var(--chart-series-${index + 1})`);
const SERIES_CLASSES = [
  styles.series1,
  styles.series2,
  styles.series3,
  styles.series4,
  styles.series5,
  styles.series6,
  styles.series7,
  styles.series8,
  styles.series9,
  styles.series10,
];

type ChartRow = { timestamp: number } & Record<string, number>;

export function GroupRatingHistoryChart({ history }: { history: GroupRatingHistoryData }) {
  const [playerLimit, setPlayerLimit] = useState(5);
  const displayedSeries = useMemo(
    () => history.series.slice(0, playerLimit),
    [history.series, playerLimit],
  );
  const chart = useMemo(
    () => buildChartRows(displayedSeries, history.windowStart, history.windowEnd),
    [displayedSeries, history.windowEnd, history.windowStart],
  );

  return (
    <section className={styles.card} aria-labelledby="group-rating-history-title">
      <div className={styles.header}>
        <div>
          <h2 id="group-rating-history-title">Rating history</h2>
          {history.windowStart && history.windowEnd ? (
            <p>{formatWindow(history.windowStart, history.windowEnd)}</p>
          ) : null}
        </div>
        {history.series.length ? (
          <label className={styles.selector}>
            <span>Players shown</span>
            <select value={playerLimit} onChange={(event) => setPlayerLimit(Number(event.target.value))}>
              {PLAYER_LIMITS.map((limit) => <option key={limit} value={limit}>Top {limit}</option>)}
            </select>
          </label>
        ) : null}
      </div>

      {displayedSeries.length ? (
        <>
          <ul className={styles.legend} aria-label="Rating history legend">
            {displayedSeries.map((series, index) => (
              <li
                key={series.playerId}
                tabIndex={0}
                aria-label={`${series.name}, current rating ${series.currentRating}`}
              >
                <span className={`${styles.swatch} ${SERIES_CLASSES[index]}`} aria-hidden="true" />
                <span>{series.name}</span>
              </li>
            ))}
          </ul>
          <div className={styles.chart} aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart.rows} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid vertical={false} stroke="var(--stroke)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={chart.xDomain}
                  tickFormatter={(value) => shortDate(Number(value))}
                  tick={{ fill: "var(--muted)", fontSize: 10 }}
                  minTickGap={28}
                />
                <YAxis domain={chart.yDomain} tick={{ fill: "var(--muted)", fontSize: 10 }} width={48} />
                <Tooltip
                  labelFormatter={(value) => longDate(Number(value))}
                  formatter={(value, name) => [Math.round(Number(value)), String(name)]}
                  contentStyle={{ background: "var(--surface)", border: "1px solid var(--stroke)", borderRadius: 8, fontSize: 12 }}
                />
                {displayedSeries.map((series, index) => (
                  <Line
                    key={series.playerId}
                    type="stepAfter"
                    dataKey={series.playerId}
                    name={series.name}
                    stroke={SERIES_COLORS[index]}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className={styles.srOnly}>
            <table>
              <caption>Rating history values</caption>
              <thead><tr><th>Player</th><th>Date</th><th>Rating</th></tr></thead>
              <tbody>
                {displayedSeries.flatMap((series) => series.points.map((point, index) => (
                  <tr key={`${series.playerId}:${point.matchId ?? "boundary"}:${point.occurredAt}:${index}`}>
                    <th scope="row">{series.name}</th>
                    <td>{longDate(Date.parse(point.occurredAt))}</td>
                    <td>{point.rating}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </>
      ) : <p className={styles.empty}>Play a match to see rating history.</p>}
    </section>
  );
}

function buildChartRows(
  series: GroupRatingHistorySeries[],
  windowStart: string,
  windowEnd: string,
): { rows: ChartRow[]; xDomain: [number, number]; yDomain: [number, number] } {
  const start = Date.parse(windowStart);
  const end = Date.parse(windowEnd);
  const timestamps = [...new Set(series.flatMap((item) => item.points.map((point) => Date.parse(point.occurredAt))))]
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  const values: number[] = [];
  const rows = timestamps.map((timestamp) => {
    const row: ChartRow = { timestamp };
    for (const item of series) {
      const point = item.points.findLast((candidate) => Date.parse(candidate.occurredAt) <= timestamp);
      if (point) {
        row[item.playerId] = point.rating;
        values.push(point.rating);
      }
    }
    return row;
  });
  const minimum = values.length ? Math.min(...values) : 1500;
  const maximum = values.length ? Math.max(...values) : 1500;

  return {
    rows,
    xDomain: [start, end],
    yDomain: [minimum - 20, maximum + 20],
  };
}

function formatWindow(start: string, end: string) {
  return `${longDate(Date.parse(start))} – ${longDate(Date.parse(end))}`;
}

function shortDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).format(timestamp);
}

function longDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(timestamp);
}
