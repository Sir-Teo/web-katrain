import type { Player } from '../../types';

export type KataGoEval = {
  blackWinProb: number; // 0..1
  blackScoreLead: number; // >0 means black ahead
  blackScoreMean: number; // >0 means black ahead (score mean)
  blackScoreStdev: number; // >=0
  blackNoResultProb: number; // 0..1
};

const softPlus = (x: number): number => {
  // Stable-ish softplus
  if (x > 20) return x;
  if (x < -20) return Math.exp(x);
  return Math.log1p(Math.exp(x));
};

export function postprocessKataGoV8(args: {
  nextPlayer: Player;
  valueLogits: ArrayLike<number>; // [win, loss, noResult] from player-to-move perspective
  scoreValue: ArrayLike<number>; // [scoreMean, scoreStdevPreSoftplus, lead, varTimeLeftPreSoftplus]
}): KataGoEval {
  const { nextPlayer, valueLogits, scoreValue } = args;

  const winLogits = valueLogits[0];
  const lossLogits = valueLogits[1];
  const noResultLogits = valueLogits[2];

  const maxLogits = Math.max(winLogits, lossLogits, noResultLogits);
  let winProb = Math.exp(winLogits - maxLogits);
  let lossProb = Math.exp(lossLogits - maxLogits);
  let noResultProb = Math.exp(noResultLogits - maxLogits);
  const probSum = winProb + lossProb + noResultProb;
  winProb /= probSum;
  lossProb /= probSum;
  noResultProb /= probSum;

  // Defaults for older models (ModelPostProcessParams).
  const scoreMeanMultiplier = 20.0;
  const scoreStdevMultiplier = 20.0;
  const leadMultiplier = 20.0;

  const scoreMeanPreScaled = scoreValue[0];
  const scoreStdevPreSoftplus = scoreValue[1];
  const leadPreScaled = scoreValue[2];

  let scoreMean = scoreMeanPreScaled * scoreMeanMultiplier;
  const scoreStdev = softPlus(scoreStdevPreSoftplus) * scoreStdevMultiplier;
  let scoreMeanSq = scoreMean * scoreMean + scoreStdev * scoreStdev;
  let lead = leadPreScaled * leadMultiplier;

  // Make unconditional with respect to no-result.
  scoreMean *= 1.0 - noResultProb;
  scoreMeanSq *= 1.0 - noResultProb;
  lead *= 1.0 - noResultProb;

  // Convert from player-to-move perspective to black perspective.
  const blackWinProb = nextPlayer === 'black' ? winProb : lossProb;
  const blackScoreLead = nextPlayer === 'black' ? lead : -lead;
  const blackScoreMean = nextPlayer === 'black' ? scoreMean : -scoreMean;
  const blackScoreStdev = Math.sqrt(Math.max(0, scoreMeanSq - scoreMean * scoreMean));
  const blackNoResultProb = noResultProb;

  return {
    blackWinProb,
    blackScoreLead,
    blackScoreMean,
    blackScoreStdev,
    blackNoResultProb,
  };
}
