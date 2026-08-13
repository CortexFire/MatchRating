import { type MatchView } from "@/lib/matches/read-model";

export type MatchHistoryStatusFilter = "pending_confirmation" | "confirmed" | "disputed";

export type MatchHistoryCursor = {
  submittedAt: string;
  id: string;
};

export type MatchHistoryRequestInput = {
  groupId?: string | null;
  status?: string | null;
  search?: string | null;
  cursor?: string | null;
};

export type NormalizedMatchHistoryRequest = {
  groupId: string | null;
  status: MatchHistoryStatusFilter | null;
  search: string | null;
  cursor: MatchHistoryCursor | null;
};

export type MatchHistoryPage = {
  matches: MatchView[];
  nextCursor: string | null;
};

export class MatchHistoryInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MatchHistoryInputError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MATCH_STATUSES = new Set<MatchHistoryStatusFilter>(["pending_confirmation", "confirmed", "disputed"]);

export function encodeMatchHistoryCursor(cursor: MatchHistoryCursor) {
  return Buffer.from(JSON.stringify({ v: 1, submittedAt: cursor.submittedAt, id: cursor.id }), "utf8").toString("base64url");
}

export function decodeMatchHistoryCursor(cursor: string): MatchHistoryCursor {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<string, unknown>;
    if (
      value.v !== 1
      || typeof value.submittedAt !== "string"
      || new Date(value.submittedAt).toISOString() !== value.submittedAt
      || typeof value.id !== "string"
      || !UUID_PATTERN.test(value.id)
    ) {
      throw new Error("invalid payload");
    }
    const decoded = { submittedAt: value.submittedAt, id: value.id };
    if (encodeMatchHistoryCursor(decoded) !== cursor) throw new Error("non-canonical payload");
    return decoded;
  } catch {
    throw new MatchHistoryInputError("Invalid match history cursor");
  }
}

export function normalizeMatchHistoryRequest(input: MatchHistoryRequestInput): NormalizedMatchHistoryRequest {
  const groupId = input.groupId?.trim() || null;
  if (groupId && !UUID_PATTERN.test(groupId)) {
    throw new MatchHistoryInputError("Invalid group ID");
  }

  const rawStatus = input.status?.trim() || null;
  const status = rawStatus === "all" ? null : rawStatus;
  if (status && !MATCH_STATUSES.has(status as MatchHistoryStatusFilter)) {
    throw new MatchHistoryInputError("Invalid match history status");
  }

  const search = input.search?.trim() || null;
  if (search && search.length > 80) {
    throw new MatchHistoryInputError("Search must be 80 characters or fewer");
  }

  return {
    groupId,
    status: status as MatchHistoryStatusFilter | null,
    search,
    cursor: input.cursor ? decodeMatchHistoryCursor(input.cursor) : null,
  };
}
