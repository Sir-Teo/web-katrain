import type { CandidateMove, FloatArray } from '../types';

/**
 * Picking a move the way a human of a given rank would, from KataGo's human SL
 * policy (docs/Analysis_Engine.md, "Human-like play"): sample from the policy at
 * full temperature rather than taking its top move, and let the engine decide when
 * to pass, because the human net was trained on records that often omit passes.
 */

export type HumanBotPick = {
  x: number;
  y: number;
  /** Probability the human net gave this move. */
  prob: number;
  /** True when the pick came from the engine rather than the human policy. */
  isPass: boolean;
};

export type HumanBotOptions = {
  humanPolicy: FloatArray;
  boardSize: number;
  /** The engine's own first choice, used only to decide whether to pass. */
  engineBest?: CandidateMove | null;
  /** Legal-move check from the caller's board state. */
  isLegal?: (x: number, y: number) => boolean;
  /**
   * < 1 makes the bot play its favourite moves more often (stronger and more
   * predictable); 1 is the faithful imitation KataGo recommends.
   */
  temperature?: number;
  /** Injectable for tests; defaults to Math.random. */
  random?: () => number;
};

export function pickHumanBotMove(options: HumanBotOptions): HumanBotPick | null {
  const { humanPolicy, boardSize } = options;
  const engineBest = options.engineBest ?? null;

  // The human net passes erratically, so passing is left to the engine.
  if (engineBest && engineBest.x < 0 && engineBest.y < 0) {
    return { x: -1, y: -1, prob: 0, isPass: true };
  }

  const temperature = options.temperature ?? 1;
  const isLegal = options.isLegal;
  const random = options.random ?? Math.random;

  const candidates: Array<{ x: number; y: number; prob: number; weight: number }> = [];
  let totalWeight = 0;
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      const prob = humanPolicy[y * boardSize + x] ?? -1;
      if (!(prob > 0)) continue;
      if (isLegal && !isLegal(x, y)) continue;
      const weight = temperature === 1 ? prob : Math.pow(prob, 1 / Math.max(1e-6, temperature));
      if (!(weight > 0) || !Number.isFinite(weight)) continue;
      candidates.push({ x, y, prob, weight });
      totalWeight += weight;
    }
  }
  if (candidates.length === 0 || !(totalWeight > 0)) return null;

  let r = random() * totalWeight;
  for (const candidate of candidates) {
    if (r < candidate.weight) {
      return { x: candidate.x, y: candidate.y, prob: candidate.prob, isPass: false };
    }
    r -= candidate.weight;
  }
  const last = candidates[candidates.length - 1]!;
  return { x: last.x, y: last.y, prob: last.prob, isPass: false };
}

/** How the move reads in the AI's thoughts line. */
export function describeHumanBotPick(pick: HumanBotPick, profile: string, boardSize: number): string {
  if (pick.isPass) return `Human (${profile}) passed, following the engine's judgement.`;
  const column = String.fromCharCode(65 + (pick.x >= 8 ? pick.x + 1 : pick.x));
  const label = `${column}${boardSize - pick.y}`;
  return `Human (${profile}) played ${label}, which players of that rank pick ${(pick.prob * 100).toFixed(1)}% of the time.`;
}
