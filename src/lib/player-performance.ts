const DEFAULT_PERFORMANCE_SD = 200;

export function performanceSdFromLogMean(logMean: number | string | null | undefined): number {
  if (logMean === null || logMean === undefined || (typeof logMean === "string" && !logMean.trim())) {
    return DEFAULT_PERFORMANCE_SD;
  }

  const numericLogMean = Number(logMean);
  if (!Number.isFinite(numericLogMean)) return DEFAULT_PERFORMANCE_SD;

  const performanceSd = Math.exp(numericLogMean);
  return Number.isFinite(performanceSd) ? Math.round(performanceSd) : DEFAULT_PERFORMANCE_SD;
}
