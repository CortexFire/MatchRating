"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  type AnalyticsPeriod,
  type AnalyticsRatingPoint,
} from "@/lib/analytics/analytics-policy";
import {
  buildRatingHistoryChartData,
  formatRatingPointDetails,
  formatRatingTooltipEntry,
} from "./rating-history-chart-data";
import styles from "./rating-history-chart.module.css";

const MAX_INSPECTOR_POINTS = 50;
const LARGE_SERIES_THRESHOLD = 50;
const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const longDateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

type ExactHistoryPage = {
  points: AnalyticsRatingPoint[];
  nextCursor: string | null;
  asOf: string;
  ratingVersion: string;
};

type InspectorStatus = "idle" | "loading" | "ready" | "error" | "conflict";

export function RatingHistoryChart({
  points,
  bounds,
  groupId,
  playerId,
  period,
  asOf,
  ratingVersion,
  onRatingVersionConflict,
}: {
  points: AnalyticsRatingPoint[];
  bounds: [number, number];
  groupId: string;
  playerId: string;
  period: AnalyticsPeriod;
  asOf: string;
  ratingVersion: string;
  onRatingVersionConflict: () => void;
}) {
  const chart = useMemo(() => buildRatingHistoryChartData(points, bounds), [bounds, points]);
  const latestPoint = points.at(-1);
  const [pages, setPages] = useState<ExactHistoryPage[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [status, setStatus] = useState<InspectorStatus>("idle");
  const [failedRequest, setFailedRequest] = useState<{ cursor: string | null; targetIndex: number } | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const currentPage = pages[pageIndex];

  async function loadPage(cursor: string | null, targetIndex: number) {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setStatus("loading");
    setFailedRequest(null);

    const parameters = new URLSearchParams({ period, asOf, ratingVersion });
    if (cursor) parameters.set("cursor", cursor);
    const url = `/api/groups/${encodeURIComponent(groupId)}/players/${encodeURIComponent(playerId)}/analytics/history?${parameters.toString()}`;

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.status === 409) {
        if (controller.signal.aborted) return;
        setPages([]);
        setPageIndex(0);
        setSelectedMatchId("");
        setFailedRequest(null);
        setStatus("conflict");
        onRatingVersionConflict();
        return;
      }
      if (!response.ok) throw new Error("Exact history request failed");
      const page = await response.json() as ExactHistoryPage;
      if (controller.signal.aborted) return;
      const boundedPage = { ...page, points: page.points.slice(0, MAX_INSPECTOR_POINTS) };
      setPages((current) => {
        const next = current.slice(0, targetIndex);
        next[targetIndex] = boundedPage;
        return next;
      });
      setPageIndex(targetIndex);
      setSelectedMatchId(boundedPage.points[0]?.matchId ?? "");
      setStatus("ready");
    } catch {
      if (!controller.signal.aborted) {
        setFailedRequest({ cursor, targetIndex });
        setStatus("error");
      }
    }
  }

  useEffect(() => () => requestRef.current?.abort(), []);

  const selected = currentPage?.points.find((point) => point.matchId === selectedMatchId)
    ?? currentPage?.points[0];
  const animateSeries = chart.points.length <= LARGE_SERIES_THRESHOLD;

  return (
    <div className={styles.chartWrap}>
      <div className={styles.chart} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chart.points} margin={{ top: 12, right: 10, bottom: 0, left: -18 }}>
            <CartesianGrid vertical={false} stroke="var(--stroke)" strokeDasharray="3 3" />
            <XAxis dataKey="occurredAt" tickFormatter={shortDate} tick={{ fill: "var(--muted)", fontSize: 10 }} minTickGap={24} />
            <YAxis domain={chart.yDomain} tick={{ fill: "var(--muted)", fontSize: 10 }} width={48} />
            <Tooltip
              labelFormatter={(value) => longDate(String(value))}
              formatter={(_value, _name, item) => formatRatingTooltipEntry(item.payload)}
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--stroke)", borderRadius: 8, fontSize: 12 }}
            />
            <Area
              type="monotone"
              dataKey="performanceRange"
              stroke="none"
              fill="var(--muted)"
              fillOpacity={0.18}
              dot={false}
              activeDot={false}
              tooltipType="none"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="rating"
              stroke="var(--action)"
              strokeWidth={3}
              dot={animateSeries ? { r: 3, fill: "var(--surface)", strokeWidth: 2 } : false}
              activeDot={{ r: 5 }}
              isAnimationActive={animateSeries}
            />
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
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className={styles.latestPoint} role="status" aria-label="Selected rating point" aria-live="polite">
        {latestPoint ? `${longDate(latestPoint.occurredAt)}: rating ${formatRatingPointDetails(latestPoint)}` : ""}
      </p>

      <details
        className={styles.inspectorDetails}
        onToggle={(event) => {
          if (event.currentTarget.open && status === "idle") void loadPage(null, 0);
        }}
      >
        <summary className={styles.inspectorSummary}>
          <span>Inspect exact matches</span>
          <ChevronDown className={styles.inspectorChevron} aria-hidden="true" />
        </summary>
        <div className={styles.inspectorContent}>
          {status === "loading" && !currentPage ? <p role="status">Loading exact matches…</p> : null}
          {status === "conflict" ? <p role="status">Ratings changed. Refreshing analytics…</p> : null}
          {status === "error" ? (
            <div className={styles.errorState}>
              <p role="alert">Could not load exact matches. Try again.</p>
              <button
                type="button"
                onClick={() => {
                  if (failedRequest) void loadPage(failedRequest.cursor, failedRequest.targetIndex);
                }}
              >
                Retry loading exact matches
              </button>
            </div>
          ) : null}
          {currentPage ? (
            <>
              {currentPage.points.length ? (
                <label className={styles.inspectorField}>
                  <span>Match</span>
                  <select
                    aria-label="Inspect rating point"
                    value={selected?.matchId ?? ""}
                    onChange={(event) => setSelectedMatchId(event.target.value)}
                  >
                    {currentPage.points.map((point) => (
                      <option key={point.matchId} value={point.matchId}>{longDate(point.occurredAt)}</option>
                    ))}
                  </select>
                </label>
              ) : <p className={styles.emptyState}>No completed matches in this period.</p>}
              {selected ? (
                <p role="status" aria-label="Selected exact rating point" aria-live="polite">
                  {`${longDate(selected.occurredAt)}: rating ${selected.rating}, deviation ${selected.rd}, consistency ±${selected.performanceSd}`}
                </p>
              ) : null}
              <div className={styles.pageNavigation}>
                <button
                  type="button"
                  disabled={pageIndex === 0 || status === "loading"}
                  onClick={() => {
                    setPageIndex((current) => current - 1);
                    const newer = pages[pageIndex - 1];
                    setSelectedMatchId(newer?.points[0]?.matchId ?? "");
                    setStatus("ready");
                  }}
                >
                  Show newer matches
                </button>
                <button
                  type="button"
                  disabled={!currentPage.nextCursor || status === "loading"}
                  onClick={() => {
                    const cached = pages[pageIndex + 1];
                    if (cached) {
                      setPageIndex(pageIndex + 1);
                      setSelectedMatchId(cached.points[0]?.matchId ?? "");
                    } else {
                      void loadPage(currentPage.nextCursor, pageIndex + 1);
                    }
                  }}
                >
                  {status === "loading" ? "Loading…" : "Show older matches"}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </details>
    </div>
  );
}

function shortDate(value: string) {
  return shortDateFormatter.format(new Date(value));
}

function longDate(value: string) {
  return longDateFormatter.format(new Date(value));
}
