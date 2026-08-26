import { describe, expect, it } from 'vitest';
import { MctsSearch } from '../src/engine/katago/analyzeMcts';
import { setBoardSize } from '../src/engine/katago/fastBoard';
import { hasModel, loadHarnessModel } from './helpers/engineHarness';
import type { BoardState, Move } from '../src/types';

// ---------------------------------------------------------------------------
// The root policy on a 19x19 board, against numbers KataGo printed.
//
// From the "TEST EXACT (NO MASKING) VS MASKED" case of
// cpp/tests/results/runSearchTestsV8.txt, whose header names the net this app
// bundles: b6c96-s175395328-d26788732, model version 8. The P column of that dump
// is the root policy after rootPolicyTemperature, which SearchParams::forTestsV1
// sets to 1.1 late and 1.2 early.
//
// Until now the only check on the network itself was the 5x5 tiny-board golden.
// This one covers the size the app actually runs at.
// ---------------------------------------------------------------------------

const SGF =
  '(;GM[1]FF[4]CA[UTF-8]RU[Japanese]SZ[19]KM[6.5];B[dd];W[qd];B[pq];W[dp];B[oc];W[pe];B[fq];W[jp];B[ph];W[cf];B[ck])';

// Move and policy percentage, in the order KataGo listed them.
const RECORDED_PRIORS: ReadonlyArray<readonly [string, number]> = [
  ['Q4', 8.67], ['C11', 11.17], ['R5', 9.24], ['C7', 9.95], ['Q17', 5.89], ['C6', 5.65],
  ['O16', 5.56], ['D7', 4.87], ['M17', 1.98], ['F17', 2.49], ['N16', 2.14], ['Q5', 1.93],
  ['R4', 2.07], ['D6', 1.95], ['E3', 1.78], ['C17', 1.85], ['N17', 1.56], ['Q10', 1.25],
];

// KataGo's test harness asked its evaluator for defaultSymmetry 1. Its symmetry
// indices are not this port's: 1 there is 7 here, the same mismatch the 5x5 golden
// ran into. Which index is used does not matter in play -- the eight are sampled or
// averaged -- but it has to be pinned to reproduce a recorded run.
const KATAGO_DEFAULT_SYMMETRY_1 = 7;

const gtpToXy = (label: string): [number, number] => {
  const columns = 'ABCDEFGHJKLMNOPQRST';
  return [columns.indexOf(label[0]!), 19 - Number.parseInt(label.slice(1), 10)];
};

const parseSgfMoves = (sgf: string): Move[] => {
  const moves: Move[] = [];
  const re = /;([BW])\[([a-s])([a-s])\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sgf))) {
    moves.push({
      x: match[2]!.charCodeAt(0) - 97,
      y: match[3]!.charCodeAt(0) - 97,
      player: match[1] === 'B' ? 'black' : 'white',
    });
  }
  return moves;
};

describe.skipIf(!hasModel())("KataGo's recorded root policy at 19x19", () => {
  it('agrees on every move it listed', async () => {
    setBoardSize(19);
    const model = await loadHarnessModel();
    const moves = parseSgfMoves(SGF);
    expect(moves.length).toBe(11);
    const board: BoardState = Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => null));
    for (const move of moves) board[move.y]![move.x] = move.player;

    const search = await MctsSearch.create({
      model,
      board,
      currentPlayer: 'white',
      moveHistory: moves,
      komi: 6.5,
      rules: 'japanese',
      nnRandomize: false,
      conservativePass: true,
      maxChildren: 40,
      ownershipMode: 'root',
      wideRootNoise: 0,
      // forTestsV1 leaves symmetry pruning off and keeps pre-root history.
      rootSymmetryPruning: false,
      ignorePreRootHistory: false,
      rootSymmetry: KATAGO_DEFAULT_SYMMETRY_1,
    });
    const policy = search.getAnalysis({ topK: 1, analysisPvLen: 0 }).policy;

    // KataGo prints the policy after the root temperature, interpolated from 1.2 on
    // move 0 toward 1.1 with a halflife of 19 moves. This is turn 11 on 19x19.
    const halflives = (11 / 19) * (19 / 19);
    const temperature = 1.1 + (1.2 - 1.1) * Math.pow(0.5, halflives);

    let maxPolicy = 0;
    for (let i = 0; i <= 361; i++) if (policy[i]! > maxPolicy) maxPolicy = policy[i]!;
    const logMax = Math.log(maxPolicy);
    const tempered = new Float64Array(362);
    let sum = 0;
    for (let i = 0; i <= 361; i++) {
      const p = policy[i]!;
      if (!(p > 0)) continue;
      tempered[i] = Math.exp((Math.log(p) - logMax) / temperature);
      sum += tempered[i]!;
    }
    expect(sum).toBeGreaterThan(0);

    for (const [label, recorded] of RECORDED_PRIORS) {
      const [x, y] = gtpToXy(label);
      const ours = (tempered[y * 19 + x]! / sum) * 100;
      // KataGo printed two decimals of a percent, and the two backends do not agree
      // to the last bit, so a quarter of a percentage point is the honest bar.
      expect(`${label} ${Math.abs(ours - recorded) < 0.25}`).toBe(`${label} true`);
    }
  }, 120000);
});
