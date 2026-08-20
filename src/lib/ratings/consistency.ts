import type { MatchFormat, Team } from "../matches/validation";

export type ConsistencyState = {
  logKappaMean: number;
  logKappaVariance: number;
  matchesPlayed: number;
};

export type ConsistencyConfig = {
  populationKappa: number;
  priorLogSd: number;
  driftLogSd: number;
};

export type ConsistencyParticipant = {
  userId: string;
  rating: number;
  consistency: ConsistencyState;
};

export type ConsistencyMatchInput = {
  matchId: string;
  revisionId: string;
  occurredAt: string;
  format: MatchFormat;
  winnerTeam: Team;
  teamA: readonly ConsistencyParticipant[];
  teamB: readonly ConsistencyParticipant[];
  sequenceOffset?: number;
};

export type ConsistencyEvent = {
  matchId: string;
  revisionId: string;
  occurredAt: string;
  format: MatchFormat;
  team: Team;
  userId: string;
  sequence: number;
  expectedScore: number;
  actualScore: 0 | 1;
  before: ConsistencyState;
  after: ConsistencyState;
};

export type ConsistencyMatchResult = {
  teamAWinProbability: number;
  states: Map<string, ConsistencyState>;
  events: ConsistencyEvent[];
};

export const DEFAULT_CONSISTENCY_CONFIG: ConsistencyConfig = {
  populationKappa: 200,
  priorLogSd: 0.35,
  driftLogSd: 0.02,
};

const MIN_KAPPA = 30;
const MAX_KAPPA = 600;
const MIN_THETA = Math.log(MIN_KAPPA);
const MAX_THETA = Math.log(MAX_KAPPA);
const MIN_POSTERIOR_VARIANCE = 1e-12;
const SERIALIZATION_DECIMALS = 12;
const SERIALIZATION_SCALE = 10 ** SERIALIZATION_DECIMALS;
const MIN_SERIALIZED_THETA = Number(MIN_THETA.toFixed(SERIALIZATION_DECIMALS));
const MIN_CANONICAL_THETA = Math.ceil(MIN_THETA * SERIALIZATION_SCALE) / SERIALIZATION_SCALE;
const MAX_CANONICAL_THETA = Math.floor(MAX_THETA * SERIALIZATION_SCALE) / SERIALIZATION_SCALE;
const LOG_SQRT_TWO_PI = 0.5 * Math.log(2 * Math.PI);
const NEGATIVE_TAIL_THRESHOLD = -2.5;
const MILLS_RATIO_CONTINUED_FRACTION_TERMS = 64;
const MAX_SOLVER_ITERATIONS = 25;
const SOLVER_GRADIENT_TOLERANCE = 1e-13;
const SOLVER_STEP_TOLERANCE = 1e-14;
const SOLVER_BOUND_TOLERANCE = 1e-12;
const SOLVER_NUMERICAL_CONVERGENCE_TOLERANCE = 1e-6;

function assertValidConfig(config: ConsistencyConfig) {
  if (
    !Number.isFinite(config.populationKappa)
    || config.populationKappa < MIN_KAPPA
    || config.populationKappa > MAX_KAPPA
    || !Number.isFinite(config.priorLogSd)
    || config.priorLogSd <= 0
    || !Number.isFinite(config.driftLogSd)
    || config.driftLogSd < 0
  ) {
    throw new Error("Invalid consistency configuration");
  }
}

function assertValidState(state: ConsistencyState) {
  const kappa = Math.exp(state.logKappaMean);
  if (
    !Number.isFinite(state.logKappaMean)
    || !Number.isFinite(kappa)
    || state.logKappaMean < MIN_SERIALIZED_THETA
    || state.logKappaMean > MAX_THETA
    || !Number.isFinite(state.logKappaVariance)
    || state.logKappaVariance <= 0
    || !Number.isSafeInteger(state.matchesPlayed)
    || state.matchesPlayed < 0
  ) {
    throw new Error("Invalid consistency state");
  }
}

function quantizeConsistencyScalar(value: number) {
  return Number(value.toFixed(SERIALIZATION_DECIMALS));
}

export function canonicalizeConsistencyState(state: ConsistencyState): ConsistencyState {
  assertValidState(state);
  const canonical = {
    logKappaMean: Math.min(
      MAX_CANONICAL_THETA,
      Math.max(MIN_CANONICAL_THETA, quantizeConsistencyScalar(state.logKappaMean)),
    ),
    logKappaVariance: Math.max(
      MIN_POSTERIOR_VARIANCE,
      quantizeConsistencyScalar(state.logKappaVariance),
    ),
    matchesPlayed: state.matchesPlayed,
  };
  assertValidState(canonical);
  return canonical;
}

export function createDefaultConsistencyState(
  config: ConsistencyConfig = DEFAULT_CONSISTENCY_CONFIG,
): ConsistencyState {
  assertValidConfig(config);
  const rawState = {
    logKappaMean: Math.log(config.populationKappa),
    logKappaVariance: config.priorLogSd ** 2,
    matchesPlayed: 0,
  };
  if (
    !Number.isFinite(rawState.logKappaMean)
    || !Number.isFinite(rawState.logKappaVariance)
    || rawState.logKappaVariance <= 0
  ) {
    throw new Error("Invalid consistency configuration");
  }
  return canonicalizeConsistencyState(rawState);
}

export function performanceSd(state: ConsistencyState) {
  assertValidState(state);
  return Math.exp(state.logKappaMean);
}

export function normalCdf(value: number) {
  if (!Number.isFinite(value)) {
    throw new Error("Normal CDF requires a finite value");
  }
  if (value === 0) {
    return 0.5;
  }

  const absoluteValue = Math.abs(value);
  if (absoluteValue <= 3.5) {
    const scaledValue = value / Math.sqrt(2);
    let term = scaledValue;
    let sum = scaledValue;

    for (let index = 1; index < 100; index += 1) {
      term *= -(scaledValue ** 2) / index;
      const addition = term / (2 * index + 1);
      sum += addition;
      if (Math.abs(addition) < Number.EPSILON * Math.max(1, Math.abs(sum))) {
        break;
      }
    }

    return 0.5 * (1 + (2 / Math.sqrt(Math.PI)) * sum);
  }

  const t = 1 / (1 + 0.2316419 * absoluteValue);
  const density = Math.exp(-0.5 * absoluteValue ** 2) / Math.sqrt(2 * Math.PI);
  const upperTail = density * t * (
    0.319381530
    + t * (
      -0.356563782
      + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))
    )
  );

  return value > 0 ? 1 - upperTail : upperTail;
}

function assertValidMatchInput(input: ConsistencyMatchInput, config: ConsistencyConfig) {
  assertValidConfig(config);
  if (input.format !== "singles" && input.format !== "doubles") {
    throw new Error("Invalid match format");
  }
  const expectedTeamSize = input.format === "singles" ? 1 : 2;
  if (
    input.teamA.length !== expectedTeamSize
    || input.teamB.length !== expectedTeamSize
  ) {
    throw new Error(`Invalid ${input.format} team shape`);
  }
  if (
    input.winnerTeam !== "A"
    && input.winnerTeam !== "B"
  ) {
    throw new Error("Invalid winning team");
  }
  const sequenceOffset = input.sequenceOffset ?? 0;
  if (!Number.isSafeInteger(sequenceOffset) || sequenceOffset < 0) {
    throw new Error("Invalid consistency sequence offset");
  }
  if (!Number.isSafeInteger(sequenceOffset + input.teamA.length + input.teamB.length)) {
    throw new Error("Invalid consistency sequence range");
  }

  const userIds = new Set<string>();
  for (const participant of [...input.teamA, ...input.teamB]) {
    if (
      participant.userId.length === 0
      || !Number.isFinite(participant.rating)
    ) {
      throw new Error("Invalid consistency participant");
    }
    assertValidState(participant.consistency);
    if (!Number.isSafeInteger(participant.consistency.matchesPlayed + 1)) {
      throw new Error("Invalid consistency matches played");
    }
    if (userIds.has(participant.userId)) {
      throw new Error("Duplicate consistency participant");
    }
    userIds.add(participant.userId);
  }
}

type PosteriorEvaluation = {
  value: number;
  gradient: number[];
  hessian: number[][];
};

function clampTheta(theta: number) {
  return Math.min(MAX_CANONICAL_THETA, Math.max(MIN_CANONICAL_THETA, theta));
}

function negativeTailInverseMillsRatio(z: number) {
  const magnitude = -z;
  let denominator = magnitude;
  for (
    let order = MILLS_RATIO_CONTINUED_FRACTION_TERMS;
    order >= 2;
    order -= 1
  ) {
    denominator = magnitude + order / denominator;
  }
  const zPlusRatio = 1 / denominator;
  return {
    ratio: magnitude + zPlusRatio,
    zPlusRatio,
  };
}

function logNormalCdf(value: number): number {
  if (value === 0) {
    return Math.log(0.5);
  }
  if (value < 0) {
    if (value > NEGATIVE_TAIL_THRESHOLD) {
      return Math.log(normalCdf(value));
    }
    const { ratio } = negativeTailInverseMillsRatio(value);
    return -0.5 * value ** 2 - LOG_SQRT_TWO_PI - Math.log(ratio);
  }

  const logUpperTail = logNormalCdf(-value);
  return Math.log1p(-Math.exp(logUpperTail));
}

function inverseMillsRatio(value: number) {
  if (value <= NEGATIVE_TAIL_THRESHOLD) {
    return negativeTailInverseMillsRatio(value);
  }
  const ratio = Math.exp(
    -0.5 * value ** 2 - LOG_SQRT_TWO_PI - logNormalCdf(value),
  );
  return { ratio, zPlusRatio: value + ratio };
}

function evaluatePosterior(
  theta: readonly number[],
  priorMeans: readonly number[],
  priorVariances: readonly number[],
  squaredWeights: readonly number[],
  signedRatingDifference: number,
): PosteriorEvaluation {
  const contributions = theta.map((value, index) => (
    squaredWeights[index] * Math.exp(2 * value)
  ));
  const totalVariance = contributions.reduce((sum, value) => sum + value, 0);
  const z = signedRatingDifference / Math.sqrt(totalVariance);
  let value = logNormalCdf(z);
  const gradient = theta.map((current, index) => {
    const difference = current - priorMeans[index];
    value -= 0.5 * difference ** 2 / priorVariances[index];
    return -difference / priorVariances[index];
  });
  const hessian = theta.map((_, row) => theta.map((__, column) => (
    row === column ? -1 / priorVariances[row] : 0
  )));

  const mills = inverseMillsRatio(z);
  const likelihoodSecondDerivative = -mills.ratio * mills.zPlusRatio;
  const shares = contributions.map((contribution) => contribution / totalVariance);
  const zGradient = shares.map((share) => -z * share);

  for (let row = 0; row < theta.length; row += 1) {
    gradient[row] += mills.ratio * zGradient[row];
    for (let column = 0; column < theta.length; column += 1) {
      const zHessian = z * shares[row] * (
        3 * shares[column] - (row === column ? 2 : 0)
      );
      hessian[row][column] += (
        likelihoodSecondDerivative * zGradient[row] * zGradient[column]
        + mills.ratio * zHessian
      );
    }
  }

  if (
    !Number.isFinite(value)
    || gradient.some((entry) => !Number.isFinite(entry))
    || hessian.some((row) => row.some((entry) => !Number.isFinite(entry)))
  ) {
    throw new Error("Non-finite consistency posterior");
  }

  return { value, gradient, hessian };
}

function cholesky(matrix: readonly (readonly number[])[]) {
  const size = matrix.length;
  const lower = Array.from({ length: size }, () => Array<number>(size).fill(0));

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column <= row; column += 1) {
      let value = matrix[row][column];
      for (let index = 0; index < column; index += 1) {
        value -= lower[row][index] * lower[column][index];
      }
      if (row === column) {
        if (!Number.isFinite(value) || value <= 0) {
          throw new Error("Consistency posterior Hessian is not positive definite");
        }
        lower[row][column] = Math.sqrt(value);
      } else {
        lower[row][column] = value / lower[column][column];
      }
    }
  }

  return lower;
}

function solveFromCholesky(lower: readonly (readonly number[])[], rightHandSide: readonly number[]) {
  const size = lower.length;
  const intermediate = Array<number>(size).fill(0);
  for (let row = 0; row < size; row += 1) {
    let value = rightHandSide[row];
    for (let column = 0; column < row; column += 1) {
      value -= lower[row][column] * intermediate[column];
    }
    intermediate[row] = value / lower[row][row];
  }

  const result = Array<number>(size).fill(0);
  for (let row = size - 1; row >= 0; row -= 1) {
    let value = intermediate[row];
    for (let column = row + 1; column < size; column += 1) {
      value -= lower[column][row] * result[column];
    }
    result[row] = value / lower[row][row];
  }
  if (result.some((entry) => !Number.isFinite(entry))) {
    throw new Error("Non-finite consistency posterior");
  }
  return result;
}

function negativeHessian(hessian: readonly (readonly number[])[]) {
  return hessian.map((row) => row.map((value) => -value));
}

function projectedGradient(theta: readonly number[], gradient: readonly number[]) {
  return gradient.map((value, index) => {
    if (theta[index] <= MIN_CANONICAL_THETA + SOLVER_BOUND_TOLERANCE && value < 0) {
      return 0;
    }
    if (theta[index] >= MAX_CANONICAL_THETA - SOLVER_BOUND_TOLERANCE && value > 0) {
      return 0;
    }
    return value;
  });
}

function posteriorSymmetryGroups(
  priorMeans: readonly number[],
  priorVariances: readonly number[],
  squaredWeights: readonly number[],
) {
  const groups: number[][] = [];
  for (let index = 0; index < priorMeans.length; index += 1) {
    const group = groups.find((candidate) => {
      const representative = candidate[0];
      return priorMeans[representative] === priorMeans[index]
        && priorVariances[representative] === priorVariances[index]
        && squaredWeights[representative] === squaredWeights[index];
    });
    if (group) {
      group.push(index);
    } else {
      groups.push([index]);
    }
  }
  return groups;
}

function symmetrizePosteriorValues(
  values: readonly number[],
  symmetryGroups: readonly (readonly number[])[],
) {
  const symmetricValues = [...values];
  for (const group of symmetryGroups) {
    const average = group.reduce(
      (sum, symmetricIndex) => sum + values[symmetricIndex],
      0,
    ) / group.length;
    for (const symmetricIndex of group) {
      symmetricValues[symmetricIndex] = average;
    }
  }
  return symmetricValues;
}

function improvingPosteriorCandidate(
  theta: readonly number[],
  step: readonly number[],
  evaluation: PosteriorEvaluation,
  symmetryGroups: readonly (readonly number[])[],
  priorMeans: readonly number[],
  priorVariances: readonly number[],
  squaredWeights: readonly number[],
  signedRatingDifference: number,
) {
  let scale = 1;
  for (let backtrack = 0; backtrack < 30; backtrack += 1) {
    const candidate = symmetrizePosteriorValues(
      theta.map((value, index) => clampTheta(value + scale * step[index])),
      symmetryGroups,
    );
    const displacement = candidate.map((value, index) => value - theta[index]);
    const candidateDirectionalDerivative = evaluation.gradient.reduce(
      (sum, value, index) => sum + value * displacement[index],
      0,
    );
    const candidateEvaluation = evaluatePosterior(
      candidate,
      priorMeans,
      priorVariances,
      squaredWeights,
      signedRatingDifference,
    );
    if (
      candidateDirectionalDerivative > 0
      && candidateEvaluation.value > evaluation.value
      && candidateEvaluation.value >= evaluation.value + 1e-4 * candidateDirectionalDerivative
    ) {
      return candidate;
    }
    scale /= 2;
  }
  return undefined;
}

function solvePosterior(
  priorMeans: readonly number[],
  priorVariances: readonly number[],
  squaredWeights: readonly number[],
  signedRatingDifference: number,
) {
  const symmetryGroups = posteriorSymmetryGroups(
    priorMeans,
    priorVariances,
    squaredWeights,
  );
  const symmetryGroupByIndex = priorMeans.map((_, index) => symmetryGroups.findIndex(
    (group) => group.includes(index),
  ));
  let theta = priorMeans.map(clampTheta);
  let converged = false;

  for (let iteration = 0; iteration < MAX_SOLVER_ITERATIONS; iteration += 1) {
    const evaluation = evaluatePosterior(
      theta,
      priorMeans,
      priorVariances,
      squaredWeights,
      signedRatingDifference,
    );
    const activeGradient = projectedGradient(theta, evaluation.gradient);
    const groupedGradient = symmetryGroups.map((group) => group.reduce(
      (sum, index) => sum + activeGradient[index],
      0,
    ));
    if (Math.max(...groupedGradient.map(Math.abs)) <= SOLVER_GRADIENT_TOLERANCE) {
      converged = true;
      break;
    }

    const fullSystem = negativeHessian(evaluation.hessian);
    for (let index = 0; index < theta.length; index += 1) {
      if (activeGradient[index] === 0 && evaluation.gradient[index] !== 0) {
        for (let other = 0; other < theta.length; other += 1) {
          fullSystem[index][other] = index === other ? 1 : 0;
          fullSystem[other][index] = index === other ? 1 : 0;
        }
      }
    }
    const system = symmetryGroups.map((rowGroup) => symmetryGroups.map(
      (columnGroup) => rowGroup.reduce(
        (rowSum, rowIndex) => rowSum + columnGroup.reduce(
          (columnSum, columnIndex) => columnSum + fullSystem[rowIndex][columnIndex],
          0,
        ),
        0,
      ),
    ));

    let step: number[] | undefined;
    let damping = 0;
    for (let attempt = 0; attempt < 16 && !step; attempt += 1) {
      const dampedSystem = system.map((row, rowIndex) => row.map((value, columnIndex) => (
        rowIndex === columnIndex ? value + damping : value
      )));
      try {
        const groupedStep = solveFromCholesky(cholesky(dampedSystem), groupedGradient);
        step = symmetryGroupByIndex.map((groupIndex) => groupedStep[groupIndex]);
      } catch {
        damping = damping === 0 ? 1e-8 : damping * 10;
      }
    }
    if (!step) {
      throw new Error("Consistency posterior failed to find a safe improving step");
    }
    if (Math.max(...step.map(Math.abs)) <= SOLVER_STEP_TOLERANCE) {
      converged = true;
      break;
    }

    const directionalDerivative = evaluation.gradient.reduce(
      (sum, value, index) => sum + value * step![index],
      0,
    );
    if (!Number.isFinite(directionalDerivative) || directionalDerivative <= 0) {
      throw new Error("Consistency posterior failed to find a safe improving step");
    }

    let candidate = improvingPosteriorCandidate(
      theta,
      step,
      evaluation,
      symmetryGroups,
      priorMeans,
      priorVariances,
      squaredWeights,
      signedRatingDifference,
    );
    if (!candidate) {
      const maximumGradient = Math.max(...groupedGradient.map(Math.abs));
      const groupedGradientStep = groupedGradient.map(
        (value) => 0.25 * value / maximumGradient,
      );
      const gradientStep = symmetryGroupByIndex.map(
        (groupIndex) => groupedGradientStep[groupIndex],
      );
      candidate = improvingPosteriorCandidate(
        theta,
        gradientStep,
        evaluation,
        symmetryGroups,
        priorMeans,
        priorVariances,
        squaredWeights,
        signedRatingDifference,
      );
    }
    if (!candidate) {
      if (
        Math.max(...groupedGradient.map(Math.abs))
        <= SOLVER_NUMERICAL_CONVERGENCE_TOLERANCE
      ) {
        converged = true;
        break;
      }
      throw new Error("Consistency posterior failed to find a safe improving step");
    }
    theta = candidate;
  }

  if (!converged) {
    const finalGradient = projectedGradient(
      theta,
      evaluatePosterior(
        theta,
        priorMeans,
        priorVariances,
        squaredWeights,
        signedRatingDifference,
      ).gradient,
    );
    const finalGroupedGradient = symmetryGroups.map((group) => group.reduce(
      (sum, index) => sum + finalGradient[index],
      0,
    ));
    if (Math.max(...finalGroupedGradient.map(Math.abs)) > SOLVER_GRADIENT_TOLERANCE) {
      throw new Error("Consistency posterior did not converge");
    }
  }

  const finalEvaluation = evaluatePosterior(
    theta,
    priorMeans,
    priorVariances,
    squaredWeights,
    signedRatingDifference,
  );
  const finalPrecision = negativeHessian(finalEvaluation.hessian);
  let lower: number[][] | undefined;
  let finalDamping = 0;
  for (let attempt = 0; attempt < 16 && !lower; attempt += 1) {
    const dampedPrecision = finalPrecision.map((row, rowIndex) => row.map(
      (value, columnIndex) => (
        rowIndex === columnIndex ? value + finalDamping : value
      ),
    ));
    try {
      lower = cholesky(dampedPrecision);
    } catch {
      finalDamping = finalDamping === 0 ? 1e-8 : finalDamping * 10;
    }
  }
  if (!lower) {
    throw new Error("Consistency posterior Hessian is not positive definite");
  }
  const marginalVariances = theta.map((_, index) => {
    const unit = theta.map((__, unitIndex) => unitIndex === index ? 1 : 0);
    const covarianceColumn = solveFromCholesky(lower, unit);
    return Math.min(
      priorVariances[index],
      Math.max(MIN_POSTERIOR_VARIANCE, covarianceColumn[index]),
    );
  });

  for (let index = 0; index < theta.length; index += 1) {
    const symmetricIndexes = theta.map((_, candidateIndex) => candidateIndex).filter(
      (candidateIndex) => (
        priorMeans[candidateIndex] === priorMeans[index]
        && priorVariances[candidateIndex] === priorVariances[index]
        && squaredWeights[candidateIndex] === squaredWeights[index]
      ),
    );
    const symmetricMean = symmetricIndexes.reduce(
      (sum, candidateIndex) => sum + theta[candidateIndex],
      0,
    ) / symmetricIndexes.length;
    const symmetricVariance = symmetricIndexes.reduce(
      (sum, candidateIndex) => sum + marginalVariances[candidateIndex],
      0,
    ) / symmetricIndexes.length;
    for (const symmetricIndex of symmetricIndexes) {
      theta[symmetricIndex] = symmetricMean;
      marginalVariances[symmetricIndex] = symmetricVariance;
    }
  }

  if (
    theta.some((value) => !Number.isFinite(value))
    || marginalVariances.some((value) => !Number.isFinite(value) || value <= 0)
  ) {
    throw new Error("Non-finite consistency posterior");
  }
  return { theta, marginalVariances };
}

function buildMatchResult(
  input: ConsistencyMatchInput,
  participants: ReadonlyArray<{ participant: ConsistencyParticipant; team: Team }>,
  teamAWinProbability: number,
  means: readonly number[],
  variances: readonly number[],
): ConsistencyMatchResult {
  const states = new Map<string, ConsistencyState>();
  const events = participants.map(({ participant, team }, index) => {
    const before = { ...participant.consistency };
    const after = canonicalizeConsistencyState({
      logKappaMean: means[index],
      logKappaVariance: variances[index],
      matchesPlayed: before.matchesPlayed + 1,
    });
    states.set(participant.userId, { ...after });
    return {
      matchId: input.matchId,
      revisionId: input.revisionId,
      occurredAt: input.occurredAt,
      format: input.format,
      team,
      userId: participant.userId,
      sequence: (input.sequenceOffset ?? 0) + index + 1,
      expectedScore: team === "A" ? teamAWinProbability : 1 - teamAWinProbability,
      actualScore: (team === input.winnerTeam ? 1 : 0) as 0 | 1,
      before,
      after: { ...after },
    };
  });

  return { teamAWinProbability, states, events };
}

export function updateMatchConsistency(
  input: ConsistencyMatchInput,
  config: ConsistencyConfig = DEFAULT_CONSISTENCY_CONFIG,
): ConsistencyMatchResult {
  const normalizedInput = {
    ...input,
    teamA: input.teamA.map((participant) => ({
      ...participant,
      consistency: canonicalizeConsistencyState(participant.consistency),
    })),
    teamB: input.teamB.map((participant) => ({
      ...participant,
      consistency: canonicalizeConsistencyState(participant.consistency),
    })),
  };
  assertValidMatchInput(normalizedInput, config);
  const ratingA = normalizedInput.teamA.reduce(
    (sum, participant) => sum + participant.rating,
    0,
  ) / normalizedInput.teamA.length;
  const ratingB = normalizedInput.teamB.reduce(
    (sum, participant) => sum + participant.rating,
    0,
  ) / normalizedInput.teamB.length;
  const ratingDifference = ratingA - ratingB;
  const participants = [
    ...normalizedInput.teamA.map((participant) => ({ participant, team: "A" as const })),
    ...normalizedInput.teamB.map((participant) => ({ participant, team: "B" as const })),
  ];
  if (!Number.isFinite(ratingDifference)) {
    throw new Error("Non-finite consistency model input");
  }

  const priorMeans = participants.map(({ participant }) => participant.consistency.logKappaMean);
  const priorVariances = participants.map(({ participant }) => {
    const variance = participant.consistency.logKappaVariance + config.driftLogSd ** 2;
    if (!Number.isFinite(variance) || variance <= 0) {
      throw new Error("Non-finite consistency posterior");
    }
    return variance;
  });
  const weight = input.format === "singles" ? 1 : 0.5;
  const squaredWeights = participants.map(() => weight ** 2);
  const totalPerformanceVariance = priorMeans.reduce((sum, mean, index) => (
    sum + squaredWeights[index] * Math.exp(2 * mean)
  ), 0);
  const teamAWinProbability = normalCdf(
    ratingDifference / Math.sqrt(totalPerformanceVariance),
  );
  if (!Number.isFinite(teamAWinProbability)) {
    throw new Error("Non-finite consistency model input");
  }

  if (ratingDifference === 0) {
    return buildMatchResult(
      input,
      participants,
      teamAWinProbability,
      priorMeans,
      priorVariances,
    );
  }

  const signedRatingDifference = input.winnerTeam === "A"
    ? ratingDifference
    : -ratingDifference;
  const posterior = solvePosterior(
    priorMeans,
    priorVariances,
    squaredWeights,
    signedRatingDifference,
  );
  return buildMatchResult(
    input,
    participants,
    teamAWinProbability,
    posterior.theta,
    posterior.marginalVariances,
  );
}
