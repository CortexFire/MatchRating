import { describe, expect, test } from "vitest";
import { DEFAULT_CONSISTENCY_CONFIG } from "./consistency";
import {
  resolveConsistencyRuntimeConfig,
  type ConsistencyCalibrationArtifact,
} from "./consistency-runtime-config";

function qualifiedArtifact(
  overrides: Partial<ConsistencyCalibrationArtifact> = {},
): ConsistencyCalibrationArtifact {
  return {
    qualified: true,
    populationKappa: 175,
    priorLogSd: 0.2,
    driftLogSd: 0.01,
    groupCount: 4,
    trainingMatches: 240,
    heldOutMatches: 100,
    individualizedTrainingLogLoss: 0.61,
    individualizedTrainingBrier: 0.21,
    individualizedHeldOutLogLoss: 0.62,
    individualizedHeldOutBrier: 0.22,
    nullTrainingLogLoss: 0.65,
    nullTrainingBrier: 0.23,
    nullHeldOutLogLoss: 0.64,
    nullHeldOutBrier: 0.24,
    dataThrough: "2026-08-20T12:00:00.000Z",
    ...overrides,
  };
}

describe("consistency runtime calibration", () => {
  test("returns qualified artifact hyperparameters after validating the full gate", () => {
    expect(resolveConsistencyRuntimeConfig(qualifiedArtifact())).toEqual({
      populationKappa: 175,
      priorLogSd: 0.2,
      driftLogSd: 0.01,
    });
  });

  test.each([
    ["unqualified", { qualified: false }],
    ["too few held-out matches", { heldOutMatches: 99 }],
    ["no groups", { groupCount: 0 }],
    ["no training matches", { trainingMatches: 0 }],
    ["invalid population kappa", { populationKappa: 601 }],
    ["invalid prior", { priorLogSd: 0 }],
    ["invalid drift", { driftLogSd: -0.01 }],
    ["non-finite metric", { individualizedTrainingLogLoss: Number.NaN }],
    ["out-of-bounds Brier", { nullHeldOutBrier: 1.01 }],
    ["non-improving held-out loss", { individualizedHeldOutLogLoss: 0.64 }],
    ["invalid timestamp", { dataThrough: "not-a-date" }],
  ])("returns the exact fallback for %s", (_, overrides) => {
    expect(resolveConsistencyRuntimeConfig(qualifiedArtifact(overrides))).toBe(
      DEFAULT_CONSISTENCY_CONFIG,
    );
  });

  test("returns the exact fallback for a malformed artifact", () => {
    expect(resolveConsistencyRuntimeConfig({ qualified: true })).toBe(
      DEFAULT_CONSISTENCY_CONFIG,
    );
  });
});
