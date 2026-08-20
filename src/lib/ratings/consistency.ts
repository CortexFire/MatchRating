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
const MIN_LIKELIHOOD_PROBABILITY = 1e-12;
const MAX_SOLVER_ITERATIONS = 25;
const SOLVER_TOLERANCE = 1e-8;

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
    || state.logKappaMean < MIN_THETA
    || state.logKappaMean > MAX_THETA
    || !Number.isFinite(state.logKappaVariance)
    || state.logKappaVariance <= 0
    || !Number.isSafeInteger(state.matchesPlayed)
    || state.matchesPlayed < 0
  ) {
    throw new Error("Invalid consistency state");
  }
}

export function createDefaultConsistencyState(
  config: ConsistencyConfig = DEFAULT_CONSISTENCY_CONFIG,
): ConsistencyState {
  assertValidConfig(config);
  const state = {
    logKappaMean: Math.log(config.populationKappa),
    logKappaVariance: config.priorLogSd ** 2,
    matchesPlayed: 0,
  };
  if (
    !Number.isFinite(state.logKappaMean)
    || !Number.isFinite(state.logKappaVariance)
    || state.logKappaVariance <= 0
  ) {
    throw new Error("Invalid consistency configuration");
  }
  return state;
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
  return Math.min(MAX_THETA, Math.max(MIN_THETA, theta));
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
  const probability = normalCdf(z);
  const likelihoodProbability = Math.min(
    1 - MIN_LIKELIHOOD_PROBABILITY,
    Math.max(MIN_LIKELIHOOD_PROBABILITY, probability),
  );
  let value = Math.log(likelihoodProbability);
  const gradient = theta.map((current, index) => {
    const difference = current - priorMeans[index];
    value -= 0.5 * difference ** 2 / priorVariances[index];
    return -difference / priorVariances[index];
  });
  const hessian = theta.map((_, row) => theta.map((__, column) => (
    row === column ? -1 / priorVariances[row] : 0
  )));

  if (
    probability > MIN_LIKELIHOOD_PROBABILITY
    && probability < 1 - MIN_LIKELIHOOD_PROBABILITY
  ) {
    const density = Math.exp(-0.5 * z ** 2) / Math.sqrt(2 * Math.PI);
    const inverseMillsRatio = density / probability;
    const likelihoodSecondDerivative = -inverseMillsRatio * (z + inverseMillsRatio);
    const shares = contributions.map((contribution) => contribution / totalVariance);
    const zGradient = shares.map((share) => -z * share);

    for (let row = 0; row < theta.length; row += 1) {
      gradient[row] += inverseMillsRatio * zGradient[row];
      for (let column = 0; column < theta.length; column += 1) {
        const zHessian = z * shares[row] * (
          3 * shares[column] - (row === column ? 2 : 0)
        );
        hessian[row][column] += (
          likelihoodSecondDerivative * zGradient[row] * zGradient[column]
          + inverseMillsRatio * zHessian
        );
      }
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
    if (theta[index] <= MIN_THETA + SOLVER_TOLERANCE && value < 0) {
      return 0;
    }
    if (theta[index] >= MAX_THETA - SOLVER_TOLERANCE && value > 0) {
      return 0;
    }
    return value;
  });
}

function solvePosterior(
  priorMeans: readonly number[],
  priorVariances: readonly number[],
  squaredWeights: readonly number[],
  signedRatingDifference: number,
) {
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
    if (Math.max(...activeGradient.map(Math.abs)) <= SOLVER_TOLERANCE) {
      converged = true;
      break;
    }

    const system = negativeHessian(evaluation.hessian);
    const rightHandSide = [...activeGradient];
    for (let index = 0; index < theta.length; index += 1) {
      if (activeGradient[index] === 0 && evaluation.gradient[index] !== 0) {
        for (let other = 0; other < theta.length; other += 1) {
          system[index][other] = index === other ? 1 : 0;
          system[other][index] = index === other ? 1 : 0;
        }
        rightHandSide[index] = 0;
      }
    }

    let step: number[] | undefined;
    let damping = 0;
    for (let attempt = 0; attempt < 12 && !step; attempt += 1) {
      const dampedSystem = system.map((row, rowIndex) => row.map((value, columnIndex) => (
        rowIndex === columnIndex ? value + damping : value
      )));
      try {
        step = solveFromCholesky(cholesky(dampedSystem), rightHandSide);
      } catch {
        damping = damping === 0 ? 1e-8 : damping * 10;
      }
    }
    if (!step) {
      throw new Error("Consistency posterior failed to find a safe improving step");
    }
    if (Math.max(...step.map(Math.abs)) <= SOLVER_TOLERANCE) {
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

    let accepted = false;
    let scale = 1;
    for (let backtrack = 0; backtrack < 30; backtrack += 1) {
      const candidate = theta.map((value, index) => clampTheta(value + scale * step![index]));
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
        theta = candidate;
        accepted = true;
        break;
      }
      scale /= 2;
    }
    if (!accepted) {
      throw new Error("Consistency posterior failed to find a safe improving step");
    }
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
    if (Math.max(...finalGradient.map(Math.abs)) > SOLVER_TOLERANCE) {
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
  const lower = cholesky(negativeHessian(finalEvaluation.hessian));
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
    const after = {
      logKappaMean: means[index],
      logKappaVariance: variances[index],
      matchesPlayed: before.matchesPlayed + 1,
    };
    if (
      !Number.isFinite(after.logKappaMean)
      || !Number.isFinite(after.logKappaVariance)
      || after.logKappaVariance <= 0
    ) {
      throw new Error("Non-finite consistency posterior");
    }
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
  assertValidMatchInput(input, config);
  const ratingA = input.teamA.reduce((sum, participant) => sum + participant.rating, 0)
    / input.teamA.length;
  const ratingB = input.teamB.reduce((sum, participant) => sum + participant.rating, 0)
    / input.teamB.length;
  const ratingDifference = ratingA - ratingB;
  const participants = [
    ...input.teamA.map((participant) => ({ participant, team: "A" as const })),
    ...input.teamB.map((participant) => ({ participant, team: "B" as const })),
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
