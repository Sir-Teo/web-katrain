import * as tf from '@tensorflow/tfjs';
import type { BoardState, Move, Player } from '../../types';
import { checkCaptures, isValidMove, getOpponent } from '../../utils/gameLogic';
import { extractInputsV7 } from './featuresV7';
import { postprocessKataGoV8 } from './evalV8';
import type { KataGoModelV8Tf } from './modelV8';

type Candidate = {
  x: number;
  y: number;
  policyProb: number;
  eval: { blackWinProb: number; blackScoreLead: number };
};

const BOARD_SIZE = 19;

const cloneBoard = (board: BoardState): BoardState => board.map((row) => [...row]);

const applyMove = (board: BoardState, x: number, y: number, player: Player): BoardState => {
  const tentativeBoard = cloneBoard(board);
  tentativeBoard[y][x] = player;
  const { newBoard } = checkCaptures(tentativeBoard, x, y, player);
  return newBoard;
};

export async function analyzeOnePly(args: {
  model: KataGoModelV8Tf;
  board: BoardState;
  previousBoard?: BoardState;
  currentPlayer: Player;
  moveHistory: Move[];
  komi: number;
  topK?: number;
}): Promise<{
  rootWinRate: number;
  rootScoreLead: number;
  moves: Array<{
    x: number;
    y: number;
    winRate: number;
    scoreLead: number;
    visits: number;
    pointsLost: number;
    order: number;
  }>;
}> {
  const { model, board, previousBoard, currentPlayer, moveHistory, komi } = args;
  const topK = Math.max(1, Math.min(args.topK ?? 8, 24));

  // Root eval (policy logits to pick candidates)
  const rootInputs = extractInputsV7({ board, currentPlayer, moveHistory, komi });
  const rootSpatial = tf.tensor4d(rootInputs.spatial, [1, BOARD_SIZE, BOARD_SIZE, 22]);
  const rootGlobal = tf.tensor2d(rootInputs.global, [1, 19]);
  const rootOut = model.forward(rootSpatial, rootGlobal);
  const [policyLogitsArr, valueLogitsArr, scoreValueArr] = await Promise.all([
    rootOut.policy.data(),
    rootOut.value.data(),
    rootOut.scoreValue.data(),
  ]);
  rootSpatial.dispose();
  rootGlobal.dispose();
  rootOut.policy.dispose();
  rootOut.policyPass.dispose();
  rootOut.value.dispose();
  rootOut.scoreValue.dispose();
  rootOut.ownership.dispose();

  // Compute legality + softmax for coordinate moves only.
  const legal: number[] = [];
  const logits = new Float64Array(BOARD_SIZE * BOARD_SIZE);
  logits.fill(Number.NEGATIVE_INFINITY);
  let maxLogit = Number.NEGATIVE_INFINITY;
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (board[y][x] !== null) continue;
      if (!isValidMove(board, x, y, currentPlayer, previousBoard)) continue;
      const pos = y * BOARD_SIZE + x;
      const logit = policyLogitsArr[pos];
      logits[pos] = logit;
      legal.push(pos);
      if (logit > maxLogit) maxLogit = logit;
    }
  }

  // Fallback: if no legal moves, return empty analysis.
  if (legal.length === 0) {
    const rootEval = postprocessKataGoV8({
      nextPlayer: currentPlayer,
      valueLogits: valueLogitsArr,
      scoreValue: scoreValueArr,
    });
    return {
      rootWinRate: rootEval.blackWinProb,
      rootScoreLead: rootEval.blackScoreLead,
      moves: [],
    };
  }

  let sum = 0;
  const probs = new Float64Array(BOARD_SIZE * BOARD_SIZE);
  for (const pos of legal) {
    const v = Math.exp(logits[pos] - maxLogit);
    probs[pos] = v;
    sum += v;
  }
  for (const pos of legal) probs[pos] /= sum;

  // Top-K candidates by policy.
  const sortedByPolicy = [...legal]
    .sort((a, b) => probs[b] - probs[a])
    .slice(0, Math.min(topK, legal.length));

  const candidates: Array<{ x: number; y: number; policyProb: number; nextBoard: BoardState; nextPlayer: Player; nextHistory: Move[] }> = [];
  const nextPlayer = getOpponent(currentPlayer);
  for (const pos of sortedByPolicy) {
    const x = pos % BOARD_SIZE;
    const y = (pos / BOARD_SIZE) | 0;
    const nextBoard = applyMove(board, x, y, currentPlayer);
    const nextHistory = [...moveHistory, { x, y, player: currentPlayer }];
    candidates.push({ x, y, policyProb: probs[pos], nextBoard, nextPlayer, nextHistory });
  }

  // Batch eval children (value-only).
  const batch = candidates.length;
  const spatialBatch = new Float32Array(batch * BOARD_SIZE * BOARD_SIZE * 22);
  const globalBatch = new Float32Array(batch * 19);
  for (let i = 0; i < batch; i++) {
    const inputs = extractInputsV7({
      board: candidates[i].nextBoard,
      currentPlayer: candidates[i].nextPlayer,
      moveHistory: candidates[i].nextHistory,
      komi,
    });
    spatialBatch.set(inputs.spatial, i * BOARD_SIZE * BOARD_SIZE * 22);
    globalBatch.set(inputs.global, i * 19);
  }
  const spatialTensor = tf.tensor4d(spatialBatch, [batch, BOARD_SIZE, BOARD_SIZE, 22]);
  const globalTensor = tf.tensor2d(globalBatch, [batch, 19]);
  const childOut = model.forwardValueOnly(spatialTensor, globalTensor);
  const [childValue, childScore] = await Promise.all([childOut.value.data(), childOut.scoreValue.data()]);
  spatialTensor.dispose();
  globalTensor.dispose();
  childOut.value.dispose();
  childOut.scoreValue.dispose();

  const evaled: Candidate[] = [];
  for (let i = 0; i < batch; i++) {
    const valueOffset = i * 3;
    const scoreOffset = i * 4;
    const e = postprocessKataGoV8({
      nextPlayer: candidates[i].nextPlayer,
      valueLogits: childValue.subarray(valueOffset, valueOffset + 3),
      scoreValue: childScore.subarray(scoreOffset, scoreOffset + 4),
    });
    evaled.push({ x: candidates[i].x, y: candidates[i].y, policyProb: candidates[i].policyProb, eval: e });
  }

  // Pick best according to current player score lead.
  const best = evaled.reduce((acc, cur) => {
    if (!acc) return cur;
    if (currentPlayer === 'black') return cur.eval.blackScoreLead > acc.eval.blackScoreLead ? cur : acc;
    return cur.eval.blackScoreLead < acc.eval.blackScoreLead ? cur : acc;
  }, null as Candidate | null)!;

  const rootWinRate = best.eval.blackWinProb;
  const rootScoreLead = best.eval.blackScoreLead;

  const moves = evaled.map((m) => {
    const pointsLost =
      m.x === best.x && m.y === best.y
        ? 0
        : currentPlayer === 'black'
          ? Math.max(0, rootScoreLead - m.eval.blackScoreLead)
          : Math.max(0, m.eval.blackScoreLead - rootScoreLead);

    return {
      x: m.x,
      y: m.y,
      winRate: m.eval.blackWinProb,
      scoreLead: m.eval.blackScoreLead,
      visits: Math.max(1, Math.round(m.policyProb * 10000)),
      pointsLost,
      order: 0,
    };
  });

  moves.sort((a, b) => a.pointsLost - b.pointsLost);
  moves.forEach((m, i) => (m.order = i));

  return { rootWinRate, rootScoreLead, moves };
}
