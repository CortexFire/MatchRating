import { describe, expect, test } from "vitest";
import type { HistoricalMatch } from "./glicko2";
import {
  CONSISTENCY_CANDIDATE_CONFIGS,
  calibrateConsistency,
  createCalibrationArtifact,
  evaluateConsistencyConfiguration,
  getCalibrationSplitSummary,
  selectBestIndividualizedCandidate,
  type CalibrationCandidateEvaluation,
} from "./consistency-calibration";

function match(index: number, winnerTeam: "A" | "B" = index % 3 === 0 ? "B" : "A"): HistoricalMatch {
  const teamAScore = winnerTeam === "A" ? 21 : 17;
  const teamBScore = winnerTeam === "B" ? 21 : 17;
  return {
    id: `sentinel-match-${String(index).padStart(3, "0")}`,
    revisionId: `sentinel-revision-${index}`,
    submittedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    format: "singles",
    teamAUserIds: ["sentinel-player-a"],
    teamBUserIds: ["sentinel-player-b"],
    games: [{
      gameId: `sentinel-game-${index}`,
      gameNumber: 1,
      teamAScore,
      teamBScore,
      winnerTeam,
    }],
  };
}

function candidate(
  populationKappa: number,
  priorLogSd: number,
  driftLogSd: number,
  logLoss = 0.5,
  brier = 0.2,
): CalibrationCandidateEvaluation {
  return {
    config: { populationKappa, priorLogSd, driftLogSd },
    training: { logLoss, brier },
    heldOut: { logLoss: 0.6, brier: 0.22 },
  };
}

describe("consistency calibration", () => {
  test("uses the exact 84-candidate Cartesian grid", () => {
    expect(CONSISTENCY_CANDIDATE_CONFIGS).toHaveLength(84);
    expect(CONSISTENCY_CANDIDATE_CONFIGS).toEqual(
      [120, 150, 175, 200, 225, 250, 300].flatMap((populationKappa) =>
        [0.2, 0.35, 0.5].flatMap((priorLogSd) =>
          [0, 0.01, 0.02, 0.04].map((driftLogSd) => ({
            populationKappa,
            priorLogSd,
            driftLogSd,
          })),
        ),
      ),
    );
  });

  test("splits each sorted group at floor(70%) and returns aggregates only", () => {
    const groups = new Map([
      ["sentinel-group-b", [match(12), ...Array.from({ length: 9 }, (_, index) => match(index))]],
      ["sentinel-group-a", [match(22), match(20), match(21)]],
    ]);

    expect(getCalibrationSplitSummary(groups)).toEqual({
      groupCount: 2,
      trainingMatches: 9,
      heldOutMatches: 4,
      dataThrough: "2026-01-23T00:00:00.000Z",
    });
    expect(JSON.stringify(getCalibrationSplitSummary(groups))).not.toContain("sentinel-");
  });

  test("uses the complete epsilon-free individualized tie-break chain", () => {
    const tied = [
      candidate(225, 0.35, 0, 0.4, 0.2),
      candidate(250, 0.2, 0.01, 0.4, 0.2),
      candidate(250, 0.2, 0, 0.4, 0.2),
      candidate(225, 0.2, 0, 0.4, 0.2),
      candidate(175, 0.2, 0, 0.4, 0.2),
    ];

    expect(selectBestIndividualizedCandidate(tied)).toEqual(tied[4]);
    expect(selectBestIndividualizedCandidate([
      candidate(175, 0.2, 0, 0.4, 0.21),
      candidate(300, 0.5, 0.04, 0.4, 0.2),
    ])?.config.populationKappa).toBe(300);
    expect(selectBestIndividualizedCandidate([
      candidate(175, 0.2, 0, 0.39, 0.9),
      candidate(200, 0.2, 0, 0.4, 0.1),
    ])?.config.populationKappa).toBe(175);
  });

  test("keeps null kappas fixed while individualized posteriors carry between matches", () => {
    const groups = new Map([["sentinel-group", Array.from({ length: 10 }, (_, index) => match(index))]]);
    const narrow = { populationKappa: 200, priorLogSd: 0.2, driftLogSd: 0 };
    const wide = { populationKappa: 200, priorLogSd: 0.5, driftLogSd: 0.04 };

    const fixedNarrow = evaluateConsistencyConfiguration(groups, narrow, "fixed-null");
    const fixedWide = evaluateConsistencyConfiguration(groups, wide, "fixed-null");
    const individualizedNarrow = evaluateConsistencyConfiguration(groups, narrow, "individualized");
    const individualizedWide = evaluateConsistencyConfiguration(groups, wide, "individualized");

    expect(fixedNarrow).toEqual(fixedWide);
    expect(individualizedNarrow).not.toEqual(individualizedWide);
    expect(individualizedNarrow).not.toEqual(fixedNarrow);
  });

  test("requires 100 held-out matches and strictly better individualized log loss", () => {
    const selected = candidate(175, 0.2, 0.01, 0.5, 0.2);
    selected.heldOut = { logLoss: 0.6, brier: 0.4 };
    const selectedNull = {
      config: { populationKappa: 200, priorLogSd: 0.35, driftLogSd: 0.02 },
      training: { logLoss: 0.55, brier: 0.22 },
      heldOut: { logLoss: 0.61, brier: 0.1 },
    };

    expect(createCalibrationArtifact({
      groupCount: 3,
      trainingMatches: 230,
      heldOutMatches: 99,
      dataThrough: "2026-08-20T00:00:00.000Z",
      selectedIndividualized: selected,
      selectedNull,
    })).toMatchObject({
      qualified: false,
      populationKappa: 200,
      priorLogSd: 0.35,
      driftLogSd: 0.02,
      individualizedHeldOutBrier: 0.4,
      nullHeldOutBrier: 0.1,
    });

    expect(createCalibrationArtifact({
      groupCount: 3,
      trainingMatches: 230,
      heldOutMatches: 100,
      dataThrough: "2026-08-20T00:00:00.000Z",
      selectedIndividualized: selected,
      selectedNull,
    })).toMatchObject({
      qualified: true,
      populationKappa: 175,
      priorLogSd: 0.2,
      driftLogSd: 0.01,
    });

    selectedNull.heldOut.logLoss = 0.6;
    expect(createCalibrationArtifact({
      groupCount: 3,
      trainingMatches: 230,
      heldOutMatches: 100,
      dataThrough: null,
      selectedIndividualized: selected,
      selectedNull,
    }).qualified).toBe(false);
  });

  test.each([
    ["non-finite score", { games: [{ ...match(0).games[0], teamAScore: Number.POSITIVE_INFINITY }] }],
    ["invalid timestamp", { submittedAt: "not-a-date" }],
    ["missing revision identity", { revisionId: "" }],
  ])("rejects malformed history with %s", (_, override) => {
    const malformed = { ...match(0), ...override } as HistoricalMatch;
    expect(() => calibrateConsistency(new Map([["sentinel-group", [malformed]]]))).toThrow(
      /Invalid calibration history/,
    );
  });

  test("returns only aggregate fields for an unqualified synthetic calibration", () => {
    const artifact = calibrateConsistency(new Map([
      ["sentinel-group", Array.from({ length: 4 }, (_, index) => match(index))],
    ]));

    expect(artifact.qualified).toBe(false);
    expect(artifact).toMatchObject({ groupCount: 1, trainingMatches: 2, heldOutMatches: 2 });
    expect(JSON.stringify(artifact)).not.toContain("sentinel-");
  });
});
