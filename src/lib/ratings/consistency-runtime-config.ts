import calibrationArtifact from "./consistency-calibration.json";
import {
  DEFAULT_CONSISTENCY_CONFIG,
  type ConsistencyConfig,
} from "./consistency";

export type ConsistencyCalibrationArtifact = {
  qualified: boolean;
  populationKappa: number;
  priorLogSd: number;
  driftLogSd: number;
  groupCount: number;
  trainingMatches: number;
  heldOutMatches: number;
  individualizedTrainingLogLoss: number | null;
  individualizedTrainingBrier: number | null;
  individualizedHeldOutLogLoss: number | null;
  individualizedHeldOutBrier: number | null;
  nullTrainingLogLoss: number | null;
  nullTrainingBrier: number | null;
  nullHeldOutLogLoss: number | null;
  nullHeldOutBrier: number | null;
  dataThrough: string | null;
};

const POPULATION_KAPPAS = new Set([120, 150, 175, 200, 225, 250, 300]);
const PRIOR_LOG_SDS = new Set([0.2, 0.35, 0.5]);
const DRIFT_LOG_SDS = new Set([0, 0.01, 0.02, 0.04]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCount(value: unknown, minimum: number) {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}

function isLogLoss(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isBrier(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isTimestampOrNull(value: unknown): value is string | null {
  return value === null
    || (typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value)));
}

export function resolveConsistencyRuntimeConfig(artifact: unknown): ConsistencyConfig {
  if (!isRecord(artifact) || artifact.qualified !== true) {
    return DEFAULT_CONSISTENCY_CONFIG;
  }

  const valid = POPULATION_KAPPAS.has(artifact.populationKappa as number)
    && PRIOR_LOG_SDS.has(artifact.priorLogSd as number)
    && DRIFT_LOG_SDS.has(artifact.driftLogSd as number)
    && isCount(artifact.groupCount, 1)
    && isCount(artifact.trainingMatches, 1)
    && isCount(artifact.heldOutMatches, 100)
    && isLogLoss(artifact.individualizedTrainingLogLoss)
    && isBrier(artifact.individualizedTrainingBrier)
    && isLogLoss(artifact.individualizedHeldOutLogLoss)
    && isBrier(artifact.individualizedHeldOutBrier)
    && isLogLoss(artifact.nullTrainingLogLoss)
    && isBrier(artifact.nullTrainingBrier)
    && isLogLoss(artifact.nullHeldOutLogLoss)
    && isBrier(artifact.nullHeldOutBrier)
    && artifact.individualizedHeldOutLogLoss < artifact.nullHeldOutLogLoss
    && isTimestampOrNull(artifact.dataThrough);

  if (!valid) {
    return DEFAULT_CONSISTENCY_CONFIG;
  }

  return {
    populationKappa: artifact.populationKappa as number,
    priorLogSd: artifact.priorLogSd as number,
    driftLogSd: artifact.driftLogSd as number,
  };
}

export function getRuntimeConsistencyConfig(): ConsistencyConfig {
  return resolveConsistencyRuntimeConfig(calibrationArtifact);
}
