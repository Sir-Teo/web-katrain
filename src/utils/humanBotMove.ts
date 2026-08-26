import {
  blendHumanChosenMove,
  chooseIndexWithTemperature,
  humanBotPresets,
  interpolateEarly,
  type HumanChosenCandidate,
  type HumanChosenMoveParams,
} from '../engine/katago/chosenMove';
import type { CandidateMove, FloatArray } from '../types';

/**
 * Picking a move the way a human of a given rank would, following KataGo's own
 * human-bot configs (cpp/configs/gtp_human5k_example.cfg): move the search's play
 * selection values onto the human SL policy, shifted toward moves the search likes
 * (PIKL), then sample with KataGo's chosen-move temperature. Passing keeps the
 * search's own pass weight, because the human records the net learned from often
 * omit passes.
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
   * The searched root moves. Without them the bot is pure imitation; with them the
   * search's play selection values and utilities join the blend, as KataGo's do.
   */
  candidates?: readonly CandidateMove[] | null;
  /** Whose turn it is, for the sign of the utilities. Defaults to black. */
  playerToMove?: 'black' | 'white';
  /** Moves played so far, for KataGo's early/late temperature interpolation. */
  turnNumber?: number;
  /** Overrides on KataGo's shipped human-bot settings. */
  params?: Partial<HumanChosenMoveParams>;
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

  const params: HumanChosenMoveParams = { ...humanBotPresets.imitate, ...options.params };
  const isLegal = options.isLegal;
  const random = options.random ?? Math.random;
  const area = boardSize * boardSize;

  // The searched moves first, then every other move the human net likes, the way
  // KataGo fills raw policy moves in at the root before averaging the human policy in.
  const moves: Array<{ x: number; y: number; prob: number }> = [];
  const candidates: HumanChosenCandidate[] = [];
  const seen = new Set<number>();
  const probAt = (x: number, y: number): number => {
    const raw = x < 0 || y < 0 ? (humanPolicy[area] ?? -1) : (humanPolicy[y * boardSize + x] ?? -1);
    return raw > 0 ? raw : 0;
  };

  for (const candidate of options.candidates ?? []) {
    const isPass = candidate.x < 0 || candidate.y < 0;
    if (!isPass) {
      if (candidate.x >= boardSize || candidate.y >= boardSize) continue;
      if (isLegal && !isLegal(candidate.x, candidate.y)) continue;
    }
    const key = isPass ? area : candidate.y * boardSize + candidate.x;
    if (seen.has(key)) continue;
    seen.add(key);
    const prob = candidate.humanPrior !== undefined && candidate.humanPrior > 0 ? candidate.humanPrior : probAt(candidate.x, candidate.y);
    moves.push({ x: candidate.x, y: candidate.y, prob });
    candidates.push({
      playSelectionValue: candidate.playSelectionValue ?? candidate.visits ?? 0,
      humanProb: prob,
      utility: candidate.utility ?? null,
      isPass,
    });
  }

  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      const key = y * boardSize + x;
      if (seen.has(key)) continue;
      const prob = humanPolicy[key] ?? -1;
      if (!(prob > 0)) continue;
      if (isLegal && !isLegal(x, y)) continue;
      seen.add(key);
      moves.push({ x, y, prob });
      candidates.push({ playSelectionValue: 0, humanProb: prob, utility: null, isPass: false });
    }
  }

  if (candidates.length === 0) return null;

  const values = blendHumanChosenMove({
    candidates,
    playerToMove: options.playerToMove ?? 'black',
    params,
  });

  const temperature = interpolateEarly({
    halflife: params.temperatureHalflife,
    earlyValue: params.temperatureEarly,
    value: params.temperature,
    turnNumber: options.turnNumber ?? 0,
    boardWidth: boardSize,
    boardHeight: boardSize,
  });

  const index = chooseIndexWithTemperature(values, temperature, params.temperatureOnlyBelowProb, random);
  if (index < 0) return null;
  const chosen = moves[index]!;
  if (chosen.x < 0 || chosen.y < 0) return { x: -1, y: -1, prob: chosen.prob, isPass: true };
  return { x: chosen.x, y: chosen.y, prob: chosen.prob, isPass: false };
}

/** How the move reads in the AI's thoughts line. */
export function describeHumanBotPick(pick: HumanBotPick, profile: string, boardSize: number): string {
  if (pick.isPass) return `Human (${profile}) passed, following the engine's judgement.`;
  const column = String.fromCharCode(65 + (pick.x >= 8 ? pick.x + 1 : pick.x));
  const label = `${column}${boardSize - pick.y}`;
  return `Human (${profile}) played ${label}, which players of that rank pick ${(pick.prob * 100).toFixed(1)}% of the time.`;
}
