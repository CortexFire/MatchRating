import {
  validateMatchSubmission,
  type MatchFormat,
  type Team,
} from "../matches/validation";

const SCALE = 173.7178;

export type RatingState = {
  rating: number;
  rd: number;
  volatility: number;
  gamesPlayed: number;
};

export type RatingResult = {
  opponent: RatingState;
  score: 0 | 0.5 | 1;
};

export type RatingOptions = {
  tau?: number;
  epsilon?: number;
};

export type HistoricalMatch = {
  id: string;
  revisionId: string;
  submittedAt: string;
  format: MatchFormat;
  teamAUserIds: string[];
  teamBUserIds: string[];
  games: Array<{ teamAScore: number; teamBScore: number }>;
};

export type RatingEvent = {
  matchId: string;
  revisionId: string;
  userId: string;
  sequence: number;
  before: RatingState;
  after: RatingState;
};

export const DEFAULT_RATING: RatingState = {
  rating: 1500,
  rd: 350,
  volatility: 0.06,
  gamesPlayed: 0,
};

function toMu(rating: number) {
  return (rating - 1500) / SCALE;
}

function toPhi(rd: number) {
  return rd / SCALE;
}

function fromMu(mu: number) {
  return mu * SCALE + 1500;
}

function fromPhi(phi: number) {
  return phi * SCALE;
}

function g(phi: number) {
  return 1 / Math.sqrt(1 + (3 * phi ** 2) / Math.PI ** 2);
}

function expectedScore(mu: number, opponentMu: number, opponentPhi: number) {
  return 1 / (1 + Math.exp(-g(opponentPhi) * (mu - opponentMu)));
}

function clampRatingState(state: RatingState): RatingState {
  return {
    rating: Number(state.rating.toFixed(6)),
    rd: Number(Math.min(350, Math.max(30, state.rd)).toFixed(6)),
    volatility: Number(Math.max(0.000001, state.volatility).toFixed(8)),
    gamesPlayed: state.gamesPlayed,
  };
}

export function updateRatingPeriod(
  player: RatingState,
  results: RatingResult[],
  options: RatingOptions = {},
): RatingState {
  if (results.length === 0) {
    const phi = toPhi(player.rd);
    return clampRatingState({
      ...player,
      rd: fromPhi(Math.sqrt(phi ** 2 + player.volatility ** 2)),
    });
  }

  const tau = options.tau ?? 0.5;
  const epsilon = options.epsilon ?? 0.000001;
  const mu = toMu(player.rating);
  const phi = toPhi(player.rd);
  const sigma = player.volatility;

  const convertedResults = results.map((result) => ({
    opponentMu: toMu(result.opponent.rating),
    opponentPhi: toPhi(result.opponent.rd),
    score: result.score,
  }));

  const variance =
    1 /
    convertedResults.reduce((sum, result) => {
      const expectation = expectedScore(mu, result.opponentMu, result.opponentPhi);
      return sum + g(result.opponentPhi) ** 2 * expectation * (1 - expectation);
    }, 0);

  const delta =
    variance *
    convertedResults.reduce((sum, result) => {
      const expectation = expectedScore(mu, result.opponentMu, result.opponentPhi);
      return sum + g(result.opponentPhi) * (result.score - expectation);
    }, 0);

  const sigmaPrime = computeVolatility({
    phi,
    sigma,
    delta,
    variance,
    tau,
    epsilon,
  });
  const phiStar = Math.sqrt(phi ** 2 + sigmaPrime ** 2);
  const phiPrime = 1 / Math.sqrt(1 / phiStar ** 2 + 1 / variance);
  const muPrime =
    mu +
    phiPrime ** 2 *
      convertedResults.reduce((sum, result) => {
        const expectation = expectedScore(mu, result.opponentMu, result.opponentPhi);
        return sum + g(result.opponentPhi) * (result.score - expectation);
      }, 0);

  return clampRatingState({
    rating: fromMu(muPrime),
    rd: fromPhi(phiPrime),
    volatility: sigmaPrime,
    gamesPlayed: player.gamesPlayed + results.length,
  });
}

function computeVolatility({
  phi,
  sigma,
  delta,
  variance,
  tau,
  epsilon,
}: {
  phi: number;
  sigma: number;
  delta: number;
  variance: number;
  tau: number;
  epsilon: number;
}) {
  const a = Math.log(sigma ** 2);
  const f = (x: number) => {
    const expX = Math.exp(x);
    const numerator = expX * (delta ** 2 - phi ** 2 - variance - expX);
    const denominator = 2 * (phi ** 2 + variance + expX) ** 2;
    return numerator / denominator - (x - a) / tau ** 2;
  };

  let A = a;
  let B: number;

  if (delta ** 2 > phi ** 2 + variance) {
    B = Math.log(delta ** 2 - phi ** 2 - variance);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) {
      k += 1;
    }
    B = a - k * tau;
  }

  let fA = f(A);
  let fB = f(B);

  while (Math.abs(B - A) > epsilon) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);

    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }

    B = C;
    fB = fC;
  }

  return Math.exp(A / 2);
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function combinedTeamPhi(team: readonly RatingState[]) {
  const phis = team.map((player) => toPhi(player.rd));
  return Math.sqrt(phis.reduce((sum, phi) => sum + phi ** 2, 0)) / team.length;
}

function teamExpectation(team: readonly RatingState[], opponents: readonly RatingState[]) {
  return expectedScore(
    average(team.map((player) => toMu(player.rating))),
    average(opponents.map((player) => toMu(player.rating))),
    combinedTeamPhi(opponents),
  );
}

function effectiveOpponentForTeamExpectation(
  player: RatingState,
  opponentTeam: readonly RatingState[],
  expectation: number,
): RatingState {
  const phi = combinedTeamPhi(opponentTeam);
  const safeExpectation = Math.min(0.999999, Math.max(0.000001, expectation));
  const logit = Math.log(safeExpectation / (1 - safeExpectation));
  const opponentMu = toMu(player.rating) - logit / g(phi);

  return {
    rating: fromMu(opponentMu),
    rd: fromPhi(phi),
    volatility: average(opponentTeam.map((opponent) => opponent.volatility)),
    gamesPlayed: Math.round(average(opponentTeam.map((opponent) => opponent.gamesPlayed))),
  };
}

export function updateDoublesGame(
  teamA: readonly [RatingState, RatingState],
  teamB: readonly [RatingState, RatingState],
  winnerTeam: Team,
): { teamA: [RatingState, RatingState]; teamB: [RatingState, RatingState] } {
  const expectationA = teamExpectation(teamA, teamB);
  const expectationB = 1 - expectationA;
  const scoreA = winnerTeam === "A" ? 1 : 0;
  const scoreB = winnerTeam === "B" ? 1 : 0;

  return {
    teamA: teamA.map((player) =>
      updateRatingPeriod(player, [
        {
          opponent: effectiveOpponentForTeamExpectation(player, teamB, expectationA),
          score: scoreA,
        },
      ]),
    ) as [RatingState, RatingState],
    teamB: teamB.map((player) =>
      updateRatingPeriod(player, [
        {
          opponent: effectiveOpponentForTeamExpectation(player, teamA, expectationB),
          score: scoreB,
        },
      ]),
    ) as [RatingState, RatingState],
  };
}

function getRating(map: Map<string, RatingState>, userId: string) {
  const rating = map.get(userId);
  if (rating) {
    return rating;
  }

  const created = { ...DEFAULT_RATING };
  map.set(userId, created);
  return created;
}

function setRatingWithEvent(
  ratings: Map<string, RatingState>,
  events: RatingEvent[],
  match: HistoricalMatch,
  userId: string,
  before: RatingState,
  after: RatingState,
) {
  ratings.set(userId, after);
  events.push({
    matchId: match.id,
    revisionId: match.revisionId,
    userId,
    sequence: events.length + 1,
    before,
    after,
  });
}

export function rebuildGroupRatingsFromMatches(
  matches: HistoricalMatch[],
  initialRatings: Map<string, RatingState> = new Map(),
): { ratings: Map<string, RatingState>; events: RatingEvent[] } {
  const ratings = new Map<string, RatingState>(
    Array.from(initialRatings.entries()).map(([userId, rating]) => [userId, { ...rating }]),
  );
  const events: RatingEvent[] = [];
  const orderedMatches = [...matches].sort((a, b) => {
    const dateDiff = Date.parse(a.submittedAt) - Date.parse(b.submittedAt);
    return dateDiff === 0 ? a.id.localeCompare(b.id) : dateDiff;
  });

  for (const match of orderedMatches) {
    const validated = validateMatchSubmission({ ...match, groupId: "rating-rebuild" });

    for (const game of validated.games) {
      if (validated.format === "singles") {
        const teamAUserId = validated.teamAUserIds[0];
        const teamBUserId = validated.teamBUserIds[0];
        const beforeA = getRating(ratings, teamAUserId);
        const beforeB = getRating(ratings, teamBUserId);
        const afterA = updateRatingPeriod(beforeA, [
          { opponent: beforeB, score: game.winnerTeam === "A" ? 1 : 0 },
        ]);
        const afterB = updateRatingPeriod(beforeB, [
          { opponent: beforeA, score: game.winnerTeam === "B" ? 1 : 0 },
        ]);

        setRatingWithEvent(ratings, events, match, teamAUserId, beforeA, afterA);
        setRatingWithEvent(ratings, events, match, teamBUserId, beforeB, afterB);
      } else {
        const teamAIds = validated.teamAUserIds as [string, string];
        const teamBIds = validated.teamBUserIds as [string, string];
        const beforeTeamA = teamAIds.map((userId) => getRating(ratings, userId)) as [
          RatingState,
          RatingState,
        ];
        const beforeTeamB = teamBIds.map((userId) => getRating(ratings, userId)) as [
          RatingState,
          RatingState,
        ];
        const updated = updateDoublesGame(beforeTeamA, beforeTeamB, game.winnerTeam);

        teamAIds.forEach((userId, index) => {
          setRatingWithEvent(ratings, events, match, userId, beforeTeamA[index], updated.teamA[index]);
        });
        teamBIds.forEach((userId, index) => {
          setRatingWithEvent(ratings, events, match, userId, beforeTeamB[index], updated.teamB[index]);
        });
      }
    }
  }

  return { ratings, events };
}
