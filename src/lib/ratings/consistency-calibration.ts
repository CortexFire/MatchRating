import { validateMatchSubmission } from "../matches/validation";
import {
  DEFAULT_CONSISTENCY_CONFIG,
  type ConsistencyConfig,
  type ConsistencyState,
} from "./consistency";
import {
  rebuildGroupRatingsFromMatches,
  type HistoricalMatch,
  type RatingState,
} from "./glicko2";
import type { ConsistencyCalibrationArtifact } from "./consistency-runtime-config";

export const CONSISTENCY_POPULATION_KAPPA_GRID = [
  120, 150, 175, 200, 225, 250, 300,
] as const;
export const CONSISTENCY_PRIOR_LOG_SD_GRID = [0.2, 0.35, 0.5] as const;
export const CONSISTENCY_DRIFT_LOG_SD_GRID = [0, 0.01, 0.02, 0.04] as const;

export const CONSISTENCY_CANDIDATE_CONFIGS: readonly ConsistencyConfig[] =
  CONSISTENCY_POPULATION_KAPPA_GRID.flatMap((populationKappa) =>
    CONSISTENCY_PRIOR_LOG_SD_GRID.flatMap((priorLogSd) =>
      CONSISTENCY_DRIFT_LOG_SD_GRID.map((driftLogSd) => ({
        populationKappa,
        priorLogSd,
        driftLogSd,
      })),
    ),
  );

export type CalibrationMetrics = {
  logLoss: number | null;
  brier: number | null;
};

export type CalibrationCandidateEvaluation = {
  config: ConsistencyConfig;
  training: CalibrationMetrics;
  heldOut: CalibrationMetrics;
};

type CalibrationSplitSummary = {
  groupCount: number;
  trainingMatches: number;
  heldOutMatches: number;
  dataThrough: string | null;
};

type PreparedGroup = {
  training: HistoricalMatch[];
  heldOut: HistoricalMatch[];
};

type ScoreAccumulator = {
  count: number;
  logLoss: number;
  brier: number;
};

const MIN_SCORING_PROBABILITY = 1e-12;

function invalidHistory(): never {
  throw new Error("Invalid calibration history");
}

function orderedMatches(matches: readonly HistoricalMatch[]) {
  return [...matches].sort((left, right) => {
    const timeDifference = Date.parse(left.submittedAt) - Date.parse(right.submittedAt);
    return timeDifference === 0 ? left.id.localeCompare(right.id) : timeDifference;
  });
}

function validateHistoricalMatch(match: HistoricalMatch) {
  if (
    typeof match.id !== "string"
    || match.id.length === 0
    || typeof match.revisionId !== "string"
    || match.revisionId.length === 0
    || typeof match.submittedAt !== "string"
    || !Number.isFinite(Date.parse(match.submittedAt))
  ) {
    invalidHistory();
  }

  try {
    const validated = validateMatchSubmission({ ...match, groupId: "calibration" });
    if (validated.games.length !== match.games.length) invalidHistory();
    match.games.forEach((game, index) => {
      if (
        typeof game.gameId !== "string"
        || game.gameId.length === 0
        || !Number.isSafeInteger(game.gameNumber)
        || game.gameNumber !== index + 1
        || !Number.isFinite(game.teamAScore)
        || !Number.isFinite(game.teamBScore)
      ) {
        invalidHistory();
      }
    });
  } catch {
    invalidHistory();
  }
}

function prepareGroupedHistory(
  groupedHistory: ReadonlyMap<string, readonly HistoricalMatch[]>,
): { groups: PreparedGroup[]; summary: CalibrationSplitSummary } {
  if (!(groupedHistory instanceof Map)) invalidHistory();

  let trainingMatches = 0;
  let heldOutMatches = 0;
  let dataThroughMillis: number | null = null;
  const groups: PreparedGroup[] = [];

  for (const [groupId, matches] of [...groupedHistory.entries()].sort(([left], [right]) =>
    left.localeCompare(right))) {
    if (typeof groupId !== "string" || groupId.length === 0 || !Array.isArray(matches)) {
      invalidHistory();
    }
    const seenMatchIds = new Set<string>();
    const seenRevisionIds = new Set<string>();
    for (const match of matches) {
      validateHistoricalMatch(match);
      if (seenMatchIds.has(match.id) || seenRevisionIds.has(match.revisionId)) invalidHistory();
      seenMatchIds.add(match.id);
      seenRevisionIds.add(match.revisionId);
      const submittedAtMillis = Date.parse(match.submittedAt);
      dataThroughMillis = dataThroughMillis === null
        ? submittedAtMillis
        : Math.max(dataThroughMillis, submittedAtMillis);
    }

    const ordered = orderedMatches(matches);
    const splitIndex = Math.floor(0.7 * ordered.length);
    const training = ordered.slice(0, splitIndex);
    const heldOut = ordered.slice(splitIndex);
    trainingMatches += training.length;
    heldOutMatches += heldOut.length;
    groups.push({ training, heldOut });
  }

  return {
    groups,
    summary: {
      groupCount: groupedHistory.size,
      trainingMatches,
      heldOutMatches,
      dataThrough: dataThroughMillis === null ? null : new Date(dataThroughMillis).toISOString(),
    },
  };
}

export function getCalibrationSplitSummary(
  groupedHistory: ReadonlyMap<string, readonly HistoricalMatch[]>,
): CalibrationSplitSummary {
  return prepareGroupedHistory(groupedHistory).summary;
}

function addScore(accumulator: ScoreAccumulator, probability: number, actual: 0 | 1) {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    invalidHistory();
  }
  const clamped = Math.min(
    1 - MIN_SCORING_PROBABILITY,
    Math.max(MIN_SCORING_PROBABILITY, probability),
  );
  accumulator.count += 1;
  accumulator.logLoss += actual === 1 ? -Math.log(clamped) : -Math.log(1 - clamped);
  accumulator.brier += (clamped - actual) ** 2;
}

function finalizeMetrics(accumulator: ScoreAccumulator): CalibrationMetrics {
  if (accumulator.count === 0) return { logLoss: null, brier: null };
  const logLoss = accumulator.logLoss / accumulator.count;
  const brier = accumulator.brier / accumulator.count;
  if (!Number.isFinite(logLoss) || !Number.isFinite(brier)) invalidHistory();
  return { logLoss, brier };
}

function evaluatePreparedGroups(
  groups: readonly PreparedGroup[],
  config: ConsistencyConfig,
  mode: "individualized" | "fixed-null",
): { training: CalibrationMetrics; heldOut: CalibrationMetrics } {
  const trainingScores: ScoreAccumulator = { count: 0, logLoss: 0, brier: 0 };
  const heldOutScores: ScoreAccumulator = { count: 0, logLoss: 0, brier: 0 };

  for (const group of groups) {
    let ratings = new Map<string, RatingState>();
    let consistencyStates = new Map<string, ConsistencyState>();
    for (const [matches, scores] of [
      [group.training, trainingScores],
      [group.heldOut, heldOutScores],
    ] as const) {
      for (const match of matches) {
        const rebuilt = rebuildGroupRatingsFromMatches(
          [match],
          ratings,
          0,
          mode === "individualized" ? consistencyStates : new Map(),
          0,
          config,
        );
        const teamAEvent = rebuilt.consistencyEvents.find((event) => event.team === "A");
        if (!teamAEvent) invalidHistory();
        addScore(scores, teamAEvent.expectedScore, teamAEvent.actualScore);
        ratings = rebuilt.ratings;
        if (mode === "individualized") consistencyStates = rebuilt.consistencyStates;
      }
    }
  }

  return {
    training: finalizeMetrics(trainingScores),
    heldOut: finalizeMetrics(heldOutScores),
  };
}

export function evaluateConsistencyConfiguration(
  groupedHistory: ReadonlyMap<string, readonly HistoricalMatch[]>,
  config: ConsistencyConfig,
  mode: "individualized" | "fixed-null",
) {
  return evaluatePreparedGroups(prepareGroupedHistory(groupedHistory).groups, config, mode);
}

function compareMetric(left: number | null, right: number | null) {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return left - right;
}

function compareIndividualized(
  left: CalibrationCandidateEvaluation,
  right: CalibrationCandidateEvaluation,
) {
  return compareMetric(left.training.logLoss, right.training.logLoss)
    || compareMetric(left.training.brier, right.training.brier)
    || left.config.priorLogSd - right.config.priorLogSd
    || left.config.driftLogSd - right.config.driftLogSd
    || Math.abs(left.config.populationKappa - 200)
      - Math.abs(right.config.populationKappa - 200)
    || left.config.populationKappa - right.config.populationKappa;
}

export function selectBestIndividualizedCandidate(
  candidates: readonly CalibrationCandidateEvaluation[],
) {
  return [...candidates].sort(compareIndividualized)[0];
}

function selectBestNullCandidate(candidates: readonly CalibrationCandidateEvaluation[]) {
  return [...candidates].sort((left, right) =>
    compareMetric(left.training.logLoss, right.training.logLoss)
    || compareMetric(left.training.brier, right.training.brier)
    || Math.abs(left.config.populationKappa - 200)
      - Math.abs(right.config.populationKappa - 200)
    || left.config.populationKappa - right.config.populationKappa)[0];
}

function emptyArtifact(summary: CalibrationSplitSummary): ConsistencyCalibrationArtifact {
  return {
    qualified: false,
    ...DEFAULT_CONSISTENCY_CONFIG,
    ...summary,
    individualizedTrainingLogLoss: null,
    individualizedTrainingBrier: null,
    individualizedHeldOutLogLoss: null,
    individualizedHeldOutBrier: null,
    nullTrainingLogLoss: null,
    nullTrainingBrier: null,
    nullHeldOutLogLoss: null,
    nullHeldOutBrier: null,
  };
}

export function createCalibrationArtifact({
  groupCount,
  trainingMatches,
  heldOutMatches,
  dataThrough,
  selectedIndividualized,
  selectedNull,
}: CalibrationSplitSummary & {
  selectedIndividualized: CalibrationCandidateEvaluation;
  selectedNull: CalibrationCandidateEvaluation;
}): ConsistencyCalibrationArtifact {
  const qualifies = heldOutMatches >= 100
    && selectedIndividualized.heldOut.logLoss !== null
    && selectedNull.heldOut.logLoss !== null
    && selectedIndividualized.heldOut.logLoss < selectedNull.heldOut.logLoss;
  const runtimeConfig = qualifies
    ? selectedIndividualized.config
    : DEFAULT_CONSISTENCY_CONFIG;

  return {
    qualified: qualifies,
    ...runtimeConfig,
    groupCount,
    trainingMatches,
    heldOutMatches,
    individualizedTrainingLogLoss: selectedIndividualized.training.logLoss,
    individualizedTrainingBrier: selectedIndividualized.training.brier,
    individualizedHeldOutLogLoss: selectedIndividualized.heldOut.logLoss,
    individualizedHeldOutBrier: selectedIndividualized.heldOut.brier,
    nullTrainingLogLoss: selectedNull.training.logLoss,
    nullTrainingBrier: selectedNull.training.brier,
    nullHeldOutLogLoss: selectedNull.heldOut.logLoss,
    nullHeldOutBrier: selectedNull.heldOut.brier,
    dataThrough,
  };
}

export function calibrateConsistency(
  groupedHistory: ReadonlyMap<string, readonly HistoricalMatch[]>,
): ConsistencyCalibrationArtifact {
  const prepared = prepareGroupedHistory(groupedHistory);
  if (prepared.summary.trainingMatches === 0) return emptyArtifact(prepared.summary);

  const individualized = CONSISTENCY_CANDIDATE_CONFIGS.map((config) => ({
    config,
    ...evaluatePreparedGroups(prepared.groups, config, "individualized"),
  }));
  const nullCandidates = CONSISTENCY_POPULATION_KAPPA_GRID.map((populationKappa) => {
    const config = { ...DEFAULT_CONSISTENCY_CONFIG, populationKappa };
    return {
      config,
      ...evaluatePreparedGroups(prepared.groups, config, "fixed-null"),
    };
  });
  const selectedIndividualized = selectBestIndividualizedCandidate(individualized);
  const selectedNull = selectBestNullCandidate(nullCandidates);
  if (!selectedIndividualized || !selectedNull) return emptyArtifact(prepared.summary);

  return createCalibrationArtifact({
    ...prepared.summary,
    selectedIndividualized,
    selectedNull,
  });
}
