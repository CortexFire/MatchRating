const POSTGRES_TIMESTAMP_PATTERN = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;

export function isPostgresTimestamp(value: unknown): value is string {
  return typeof value === "string" && postgresTimestampMicros(value) !== null;
}

export function comparePostgresTimestamps(left: string, right: string): number {
  const leftMicros = postgresTimestampMicros(left);
  const rightMicros = postgresTimestampMicros(right);
  if (leftMicros === null || rightMicros === null) {
    throw new TypeError("Invalid PostgreSQL timestamp");
  }
  return leftMicros < rightMicros ? -1 : leftMicros > rightMicros ? 1 : 0;
}

function postgresTimestampMicros(value: string): bigint | null {
  const match = POSTGRES_TIMESTAMP_PATTERN.exec(value);
  if (!match) return null;

  const [, date, time, fraction = "", offset] = match;
  const wholeSecondMilliseconds = Date.parse(`${date}T${time}.000${offset}`);
  if (!Number.isFinite(wholeSecondMilliseconds)) return null;

  return BigInt(wholeSecondMilliseconds) * BigInt(1_000)
    + BigInt(fraction.padEnd(6, "0") || "0");
}
