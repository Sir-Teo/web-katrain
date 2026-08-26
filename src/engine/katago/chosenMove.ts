/**
 * KataGo's chosen-move machinery: how a bot turns a searched root into the move it
 * actually plays. Ported from cpp/search/searchhelpers.cpp
 * (`Search::chooseIndexWithTemperature`, `Search::interpolateEarly`) and the
 * "Average in human policy" block of `Search::getPlaySelectionValues`
 * (cpp/search/searchresults.cpp).
 *
 * The defaults live in `humanBotPresets` below, copied from the two human-bot
 * configs KataGo ships (cpp/configs/gtp_human5k_example.cfg and
 * gtp_human9d_search_example.cfg).
 */

export type ChosenMoveTemperature = {
  /** chosenMoveTemperature: the temperature once the game is well underway. */
  temperature: number;
  /** chosenMoveTemperatureEarly: the temperature on move 0, decaying toward `temperature`. */
  temperatureEarly: number;
  /** chosenMoveTemperatureHalflife, in moves on a 19x19 board. */
  temperatureHalflife: number;
  /**
   * chosenMoveTemperatureOnlyBelowProb: temperature only reshapes moves whose share
   * of the total is below this, so 0.01 leaves the leading moves alone and only
   * damps the tail. 1.0 applies temperature to everything.
   */
  temperatureOnlyBelowProb: number;
};

export type HumanChosenMoveParams = ChosenMoveTemperature & {
  /** humanSLChosenMoveProp: how far to move play selection toward the human policy. */
  chosenMoveProp: number;
  /**
   * humanSLChosenMovePiklLambda: the utility difference that meaningfully shifts the
   * human policy toward better moves. Huge values mean faithful imitation.
   */
  piklLambda: number;
  /** humanSLChosenMoveIgnorePass: keep the search's own pass weight, not the net's. */
  chosenMoveIgnorePass: boolean;
};

/** KataGo's own human-bot configs, which are the tuned settings for this net. */
export const humanBotPresets: Record<'imitate' | 'search', HumanChosenMoveParams> = {
  // cpp/configs/gtp_human5k_example.cfg: play the rank, don't play well.
  imitate: {
    chosenMoveProp: 1.0,
    piklLambda: 100000000,
    chosenMoveIgnorePass: true,
    temperature: 0.7,
    temperatureEarly: 0.85,
    temperatureHalflife: 80,
    temperatureOnlyBelowProb: 0.01,
  },
  // cpp/configs/gtp_human9d_search_example.cfg: human shapes, backed by the search.
  search: {
    chosenMoveProp: 1.0,
    piklLambda: 0.08,
    chosenMoveIgnorePass: true,
    temperature: 0.25,
    temperatureEarly: 0.7,
    temperatureHalflife: 30,
    temperatureOnlyBelowProb: 1.0,
  },
};

/**
 * KataGo Search::interpolateEarly: `earlyValue` on move 0 decaying to `value`, with
 * the halflife measured in 19x19 moves and rescaled for smaller boards.
 */
export function interpolateEarly(args: {
  halflife: number;
  earlyValue: number;
  value: number;
  turnNumber: number;
  boardWidth: number;
  boardHeight: number;
}): number {
  const { halflife, earlyValue, value, turnNumber } = args;
  if (!(halflife > 0)) return value;
  const rawHalflives = turnNumber / halflife;
  const halflives = (rawHalflives * 19.0) / Math.sqrt(args.boardWidth * args.boardHeight);
  return value + (earlyValue - value) * Math.pow(0.5, halflives);
}

/**
 * KataGo Search::chooseIndexWithTemperature. Samples an index in proportion to
 * `relativeProbs` after reshaping everything below `onlyBelowProb` of the total by
 * `temperature`. Returns -1 when nothing has positive weight.
 */
export function chooseIndexWithTemperature(
  relativeProbs: ArrayLike<number>,
  temperature: number,
  onlyBelowProb: number,
  random: () => number = Math.random,
  processedOut?: Float64Array
): number {
  const n = relativeProbs.length;
  if (n <= 0) return -1;

  let maxRelProb = 0;
  let sumRelProb = 0;
  for (let i = 0; i < n; i++) {
    const p = relativeProbs[i]!;
    if (p > 0) sumRelProb += p;
    if (p > maxRelProb) maxRelProb = p;
  }
  if (!(maxRelProb > 0) || !(sumRelProb > 0)) return -1;

  const processed = processedOut && processedOut.length >= n ? processedOut : new Float64Array(n);

  // Temperature so close to 0 that the max is the answer.
  if (temperature <= 1.0e-4 && onlyBelowProb >= 1.0) {
    let bestIdx = 0;
    let bestProb = relativeProbs[0]!;
    processed[0] = 0;
    for (let i = 1; i < n; i++) {
      processed[i] = 0;
      if (relativeProbs[i]! > bestProb) {
        bestProb = relativeProbs[i]!;
        bestIdx = i;
      }
    }
    processed[bestIdx] = 1;
    return bestIdx;
  }

  const logMaxRelProb = Math.log(maxRelProb);
  const logSumRelProb = Math.log(sumRelProb);
  const logOnlyBelowProb = Math.log(Math.max(1e-50, onlyBelowProb));
  const logRelProbThreshold = Math.min(0, logOnlyBelowProb + logSumRelProb - logMaxRelProb);
  const safeTemperature = Math.max(1e-6, temperature);

  let sum = 0;
  for (let i = 0; i < n; i++) {
    const p = relativeProbs[i]!;
    if (!(p > 0)) {
      processed[i] = 0;
      continue;
    }
    const logRelProb = Math.log(p) - logMaxRelProb;
    const newLogRelProb =
      logRelProb > logRelProbThreshold
        ? logRelProb
        : (logRelProb - logRelProbThreshold) / safeTemperature + logRelProbThreshold;
    const value = Math.exp(newLogRelProb);
    processed[i] = value;
    sum += value;
  }
  if (!(sum > 0)) return -1;

  let r = random() * sum;
  for (let i = 0; i < n; i++) {
    if (r < processed[i]!) return i;
    r -= processed[i]!;
  }
  // Only reachable through floating point drift at the very end of the range.
  for (let i = n - 1; i >= 0; i--) if (processed[i]! > 0) return i;
  return -1;
}

/** KataGo chosenMoveSubtract / chosenMovePrune, both capped at a 64th of the max. */
export function subtractAndPrunePlaySelectionValues(
  values: Float64Array,
  chosenMoveSubtract: number,
  chosenMovePrune: number
): void {
  let maxValue = 0;
  for (let i = 0; i < values.length; i++) if (values[i]! > maxValue) maxValue = values[i]!;
  if (!(maxValue > 0)) return;
  const amountToSubtract = Math.min(chosenMoveSubtract, maxValue / 64);
  const amountToPrune = Math.min(chosenMovePrune, maxValue / 64);
  for (let i = 0; i < values.length; i++) {
    if (values[i]! < amountToPrune) values[i] = 0;
    else values[i] = Math.max(0, values[i]! - amountToSubtract);
  }
}

export type HumanChosenCandidate = {
  /** KataGo play selection value from the search; 0 for a move it never visited. */
  playSelectionValue: number;
  /** The human net's policy for this move. Negative counts as zero. */
  humanProb: number;
  /** The child's average utility from black's perspective, or null if unvisited. */
  utility: number | null;
  isPass: boolean;
};

/**
 * The "Average in human policy" pass of KataGo's `getPlaySelectionValues`: shift the
 * human policy toward moves the search likes (PIKL), then move the play selection
 * values `chosenMoveProp` of the way onto it, keeping their overall scale.
 */
export function blendHumanChosenMove(args: {
  candidates: HumanChosenCandidate[];
  playerToMove: 'black' | 'white';
  params: Pick<HumanChosenMoveParams, 'chosenMoveProp' | 'piklLambda' | 'chosenMoveIgnorePass'>;
  /** Set when the caller has already ruled passing out, as KataGo's suppressPass does. */
  suppressPass?: boolean;
}): Float64Array {
  const { candidates, params } = args;
  const n = candidates.length;
  const values = new Float64Array(n);
  for (let i = 0; i < n; i++) values[i] = Math.max(0, candidates[i]!.playSelectionValue);
  if (n === 0 || !(params.chosenMoveProp > 0)) return values;

  const suppressPass = args.suppressPass === true;
  const sign = args.playerToMove === 'black' ? 1 : -1;
  const probOf = (c: HumanChosenCandidate): number =>
    (suppressPass && c.isPass) || !(c.humanProb > 0) ? 0 : c.humanProb;

  const shifted = new Float64Array(n);
  const selfUtility = new Float64Array(n);
  let utilitySum = 0;
  let utilityCount = 0;
  let utilityMax = -1e10;
  for (let i = 0; i < n; i++) {
    const c = candidates[i]!;
    shifted[i] = probOf(c);
    if (c.utility === null) continue;
    const self = sign * c.utility;
    selfUtility[i] = self;
    if (self > utilityMax) utilityMax = self;
    utilitySum += self;
    utilityCount += 1;
  }
  // Moves the search never reached inherit the plain average, KataGo's fpu here.
  const utilityAvg = utilitySum / Math.max(1, utilityCount);
  utilityMax = Math.max(utilityMax, utilityAvg);
  for (let i = 0; i < n; i++) if (candidates[i]!.utility === null) selfUtility[i] = utilityAvg;

  const lambda = Math.max(1e-12, params.piklLambda);
  let shiftedSum = 0;
  for (let i = 0; i < n; i++) {
    shifted[i] *= Math.exp((selfUtility[i]! - utilityMax) / lambda);
    shiftedSum += shifted[i]!;
  }
  if (!(shiftedSum > 0)) return values;
  for (let i = 0; i < n; i++) shifted[i] = shifted[i]! / shiftedSum;

  let psvSum = 0;
  let psvNonPassSum = 0;
  for (let i = 0; i < n; i++) {
    psvSum += values[i]!;
    if (!candidates[i]!.isPass) psvNonPassSum += values[i]!;
  }

  // Nothing was searched, so there is no play selection scale to preserve: the
  // human policy is the whole answer, and passing is left to whoever asked.
  if (!(psvSum > 0)) {
    for (let i = 0; i < n; i++) {
      values[i] =
        params.chosenMoveIgnorePass && candidates[i]!.isPass ? 0 : params.chosenMoveProp * shifted[i]!;
    }
    return values;
  }

  if (params.chosenMoveIgnorePass) {
    let shiftedNonPassSum = 0;
    for (let i = 0; i < n; i++) if (!candidates[i]!.isPass) shiftedNonPassSum += shifted[i]!;
    if (shiftedNonPassSum > 0) {
      const passShare = (psvSum - psvNonPassSum) / psvSum;
      const nonPassScale = psvNonPassSum / psvSum / shiftedNonPassSum;
      for (let i = 0; i < n; i++) {
        shifted[i] = candidates[i]!.isPass ? passShare : shifted[i]! * nonPassScale;
      }
    }
  }

  for (let i = 0; i < n; i++) {
    values[i] = values[i]! + params.chosenMoveProp * (psvSum * shifted[i]! - values[i]!);
  }
  return values;
}
