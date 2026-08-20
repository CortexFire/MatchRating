import { FatalError } from "workflow";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  rebuildGroupRatingsFromMatches,
  type HistoricalMatch,
  type RatingState,
} from "@/lib/ratings/glicko2";
import type { ConsistencyState } from "@/lib/ratings/consistency";
import { toRatingProjection } from "@/lib/ratings/projection";
import { validateMatchSubmission } from "@/lib/matches/validation";

type SerializedRatingState = RatingState & {
  userId: string;
  logKappaMean: number;
  logKappaVariance: number;
  consistencyMatchesPlayed: number;
};

export type RebuildInput = {
  groupId: string;
  jobId: string;
  targetVersion: number;
  prefixEventCount: number;
  prefixConsistencyEventCount: number;
  initialRatings: SerializedRatingState[];
  history: HistoricalMatch[];
};

export async function loadRebuildInput(jobId: string, dispatchToken: string): Promise<RebuildInput | null> {
  "use step";
  const { data, error } = await createSupabaseServiceClient().rpc("begin_incremental_rating_rebuild_v2", {
    p_job_id: jobId,
    p_dispatch_token: dispatchToken,
  });
  if (error) throw error;
  return data as RebuildInput | null;
}

export async function calculateProjection(input: RebuildInput) {
  "use step";
  try {
    if (!Number.isSafeInteger(input.prefixEventCount) || input.prefixEventCount < 0) {
      throw new Error("Invalid rating prefix event count");
    }
    if (
      !Number.isSafeInteger(input.prefixConsistencyEventCount)
      || input.prefixConsistencyEventCount < 0
    ) {
      throw new Error("Invalid consistency prefix event count");
    }

    const initialRatings = new Map<string, RatingState>();
    const initialConsistencyStates = new Map<string, ConsistencyState>();
    for (const {
      userId,
      rating,
      rd,
      volatility,
      gamesPlayed,
      logKappaMean,
      logKappaVariance,
      consistencyMatchesPlayed,
    } of input.initialRatings) {
      if (
        !userId
        || initialRatings.has(userId)
        || !Number.isFinite(rating)
        || !Number.isFinite(rd)
        || !Number.isFinite(volatility)
        || !Number.isSafeInteger(gamesPlayed)
        || gamesPlayed < 0
      ) {
        throw new Error("Invalid initial rating state");
      }
      initialRatings.set(userId, { rating, rd, volatility, gamesPlayed });
      const consistency = {
        logKappaMean,
        logKappaVariance,
        matchesPlayed: consistencyMatchesPlayed,
      };
      if (!isValidConsistencyState(consistency)) {
        throw new Error("Invalid initial consistency state");
      }
      initialConsistencyStates.set(userId, consistency);
    }

    const rebuilt = rebuildGroupRatingsFromMatches(
      input.history,
      initialRatings,
      input.prefixEventCount,
      initialConsistencyStates,
      input.prefixConsistencyEventCount,
    );
    return toRatingProjection(
      rebuilt.ratings,
      rebuilt.events,
      rebuilt.consistencyStates,
      rebuilt.consistencyEvents,
    );
  } catch (error) {
    throw new FatalError(errorMessage(error));
  }
}

export async function applyProjection(input: RebuildInput, projection: Awaited<ReturnType<typeof calculateProjection>>) {
  "use step";
  try {
    assertCanonicalProjection(input, projection);
  } catch (error) {
    throw new FatalError(errorMessage(error));
  }

  const { data, error } = await createSupabaseServiceClient().rpc("apply_incremental_rating_rebuild_v2", {
    p_job_id: input.jobId,
    p_expected_version: input.targetVersion,
    p_prefix_event_count: input.prefixEventCount,
    p_prefix_consistency_event_count: input.prefixConsistencyEventCount,
    p_ratings: projection.ratings,
    p_events: projection.events,
    p_consistency_events: projection.consistencyEvents,
  });
  if (error) throw error;
  return data as { status: "completed" | "stale"; targetVersion?: number };
}

function assertCanonicalProjection(
  input: RebuildInput,
  projection: Awaited<ReturnType<typeof calculateProjection>>,
) {
  if (
    !Number.isSafeInteger(input.prefixEventCount)
    || input.prefixEventCount < 0
    || !Number.isSafeInteger(input.prefixConsistencyEventCount)
    || input.prefixConsistencyEventCount < 0
  ) {
    throw new Error("Invalid canonical event prefix count");
  }

  const expectedRatingUserIds = new Set(input.initialRatings.map((rating) => rating.userId));
  const expectedFacts = new Map<string, {
    matchId: string;
    revisionId: string;
    gameNumber: number;
    occurredAt: string;
    format: HistoricalMatch["format"];
    team: "A" | "B";
    actualScore: 0 | 1;
    pointsFor: number;
    pointsAgainst: number;
  }>();
  const expectedConsistencyFacts: Array<{
    matchId: string;
    revisionId: string;
    occurredAt: string;
    format: HistoricalMatch["format"];
    team: "A" | "B";
    userId: string;
    actualScore: 0 | 1;
  }> = [];
  const expectedConsistencyKeys = new Set<string>();

  const orderedMatches = [...input.history].sort((a, b) => {
    const dateDiff = Date.parse(a.submittedAt) - Date.parse(b.submittedAt);
    return dateDiff === 0 ? a.id.localeCompare(b.id) : dateDiff;
  });
  for (const match of orderedMatches) {
    const validated = validateMatchSubmission({ ...match, groupId: input.groupId });
    for (const userId of [...match.teamAUserIds, ...match.teamBUserIds]) {
      expectedRatingUserIds.add(userId);
    }
    for (const game of match.games) {
      for (const [team, userIds] of [["A", match.teamAUserIds], ["B", match.teamBUserIds]] as const) {
        for (const userId of userIds) {
          const key = `${game.gameId}:${userId}`;
          if (expectedFacts.has(key)) throw new Error("Duplicate canonical game and player identity");
          expectedFacts.set(key, {
            matchId: match.id,
            revisionId: match.revisionId,
            gameNumber: game.gameNumber,
            occurredAt: match.submittedAt,
            format: match.format,
            team,
            actualScore: game.winnerTeam === team ? 1 : 0,
            pointsFor: team === "A" ? game.teamAScore : game.teamBScore,
            pointsAgainst: team === "A" ? game.teamBScore : game.teamAScore,
          });
        }
      }
    }
    for (const [team, userIds] of [
      ["A", validated.teamAUserIds],
      ["B", validated.teamBUserIds],
    ] as const) {
      for (const userId of userIds) {
        const key = `${match.id}:${userId}`;
        if (expectedConsistencyKeys.has(key)) {
          throw new Error("Duplicate canonical match and player identity");
        }
        expectedConsistencyKeys.add(key);
        expectedConsistencyFacts.push({
          matchId: match.id,
          revisionId: match.revisionId,
          occurredAt: match.submittedAt,
          format: validated.format,
          team,
          userId,
          actualScore: validated.matchWinnerTeam === team ? 1 : 0,
        });
      }
    }
  }

  const seenFacts = new Set<string>();
  projection.events.forEach((event, index) => {
    if (
      !isUuid(event.matchId)
      || !isUuid(event.revisionId)
      || !isUuid(event.gameId)
      || !isUuid(event.userId)
      || !Number.isSafeInteger(event.gameNumber)
      || event.gameNumber < 1
      || !Number.isFinite(Date.parse(event.occurredAt))
      || !Number.isFinite(event.expectedScore)
      || event.expectedScore < 0
      || event.expectedScore > 1
      || (event.actualScore !== 0 && event.actualScore !== 1)
      || !Number.isSafeInteger(event.pointsFor)
      || event.pointsFor < 0
      || !Number.isSafeInteger(event.pointsAgainst)
      || event.pointsAgainst < 0
      || event.sequence !== input.prefixEventCount + index + 1
      || !isValidRatingState(event.before)
      || !isValidRatingState(event.after)
      || event.after.gamesPlayed !== event.before.gamesPlayed + 1
    ) {
      throw new Error("Invalid canonical rating event");
    }

    const key = `${event.gameId}:${event.userId}`;
    if (seenFacts.has(key)) throw new Error("Duplicate canonical game and player identity");
    seenFacts.add(key);
    const expected = expectedFacts.get(key);
    if (
      !expected
      || event.matchId !== expected.matchId
      || event.revisionId !== expected.revisionId
      || event.gameNumber !== expected.gameNumber
      || event.occurredAt !== expected.occurredAt
      || event.format !== expected.format
      || event.team !== expected.team
      || event.actualScore !== expected.actualScore
      || event.pointsFor !== expected.pointsFor
      || event.pointsAgainst !== expected.pointsAgainst
    ) {
      throw new Error("Canonical rating event does not match its historical game");
    }
  });

  if (seenFacts.size !== expectedFacts.size) {
    throw new Error("Canonical rating event set is incomplete");
  }

  const seenConsistencyFacts = new Set<string>();
  const matchExpectations = new Map<string, { A?: number; B?: number }>();
  projection.consistencyEvents.forEach((event, index) => {
    if (
      !isUuid(event.matchId)
      || !isUuid(event.revisionId)
      || !isUuid(event.userId)
      || !Number.isFinite(Date.parse(event.occurredAt))
      || (event.format !== "singles" && event.format !== "doubles")
      || (event.team !== "A" && event.team !== "B")
      || !Number.isFinite(event.expectedScore)
      || event.expectedScore < 0
      || event.expectedScore > 1
      || (event.actualScore !== 0 && event.actualScore !== 1)
      || event.sequence !== input.prefixConsistencyEventCount + index + 1
      || !isValidConsistencyState(event.before)
      || !isValidConsistencyState(event.after)
      || event.after.matchesPlayed !== event.before.matchesPlayed + 1
    ) {
      throw new Error("Invalid canonical consistency event");
    }

    const key = `${event.matchId}:${event.userId}`;
    if (seenConsistencyFacts.has(key)) {
      throw new Error("Duplicate canonical match and player identity");
    }
    seenConsistencyFacts.add(key);
    const expected = expectedConsistencyFacts[index];
    if (
      !expected
      || event.matchId !== expected.matchId
      || event.revisionId !== expected.revisionId
      || event.occurredAt !== expected.occurredAt
      || event.format !== expected.format
      || event.team !== expected.team
      || event.userId !== expected.userId
      || event.actualScore !== expected.actualScore
    ) {
      throw new Error("Canonical consistency event does not match its historical match");
    }

    const expectations = matchExpectations.get(event.matchId) ?? {};
    if (expectations[event.team] !== undefined && expectations[event.team] !== event.expectedScore) {
      throw new Error("Canonical consistency team expectations disagree");
    }
    expectations[event.team] = event.expectedScore;
    matchExpectations.set(event.matchId, expectations);
  });

  if (seenConsistencyFacts.size !== expectedConsistencyFacts.length) {
    throw new Error("Canonical consistency event set is incomplete");
  }
  for (const expectations of matchExpectations.values()) {
    if (
      expectations.A === undefined
      || expectations.B === undefined
      || Math.abs(expectations.A + expectations.B - 1) > Number.EPSILON * 4
    ) {
      throw new Error("Canonical consistency expectations are not complementary");
    }
  }

  const ratingUserIds = new Set<string>();
  for (const {
    userId,
    logKappaMean,
    logKappaVariance,
    consistencyMatchesPlayed,
    ...rating
  } of projection.ratings) {
    if (
      !isUuid(userId)
      || ratingUserIds.has(userId)
      || !isValidRatingState(rating)
      || !isValidConsistencyState({
        logKappaMean,
        logKappaVariance,
        matchesPlayed: consistencyMatchesPlayed,
      })
    ) {
      throw new Error("Invalid canonical rating projection");
    }
    ratingUserIds.add(userId);
  }

  if (
    ratingUserIds.size !== expectedRatingUserIds.size
    || [...expectedRatingUserIds].some((userId) => !ratingUserIds.has(userId))
  ) {
    throw new Error("Canonical rating projection is incomplete");
  }
}

function isValidRatingState(state: RatingState) {
  return Number.isFinite(state.rating)
    && Number.isFinite(state.rd)
    && state.rd > 0
    && Number.isFinite(state.volatility)
    && state.volatility > 0
    && Number.isSafeInteger(state.gamesPlayed)
    && state.gamesPlayed >= 0;
}

function isValidConsistencyState(state: ConsistencyState) {
  const kappa = Math.exp(state.logKappaMean);
  return Number.isFinite(state.logKappaMean)
    && Number.isFinite(kappa)
    && kappa >= 30
    && kappa <= 600
    && Number.isFinite(state.logKappaVariance)
    && state.logKappaVariance > 0
    && Number.isSafeInteger(state.matchesPlayed)
    && state.matchesPlayed >= 0;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function markFailed(jobId: string, message: string) {
  "use step";
  const { error } = await createSupabaseServiceClient().rpc("fail_rating_rebuild", {
    p_job_id: jobId,
    p_error: message,
  });
  if (error) throw error;
}

function errorMessage(error: unknown): string {
  return findErrorMessage(error, new Set<object>()) ?? "Rating rebuild failed";
}

function findErrorMessage(error: unknown, seen: Set<object>): string | undefined {
  if (typeof error === "string") {
    const exhaustedStepMessage = error.replace(/^Step ".+" failed after \d+ retr(?:y|ies):\s*/, "");
    if (exhaustedStepMessage !== error) return findErrorMessage(exhaustedStepMessage, seen);

    try {
      const parsed = JSON.parse(error) as unknown;
      if (parsed !== error) return findErrorMessage(parsed, seen);
    } catch {
      // The error was not serialized JSON.
    }

    return error.length > 0 ? error : undefined;
  }

  if (typeof error !== "object" || error === null || seen.has(error)) return undefined;
  seen.add(error);

  const { message, cause } = error as { message?: unknown; cause?: unknown };
  return findErrorMessage(cause, seen) ?? findErrorMessage(message, seen);
}

export async function rebuildGroupRatingsWorkflow(jobId: string, dispatchToken: string) {
  "use workflow";

  try {
    while (true) {
      const input = await loadRebuildInput(jobId, dispatchToken);
      if (!input) return { status: "not_claimed" as const };

      const projection = await calculateProjection(input);
      const applied = await applyProjection(input, projection);
      if (applied.status === "completed") return applied;
    }
  } catch (error) {
    const message = errorMessage(error);
    await markFailed(jobId, message);
    throw new FatalError(message);
  }
}
