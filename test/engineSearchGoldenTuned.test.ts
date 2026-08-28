import { afterEach, describe, expect, it } from 'vitest';
import { MctsSearch, resetSearchTuning, setSearchTuningForTest } from '../src/engine/katago/analyzeMcts';
import { setBoardSize } from '../src/engine/katago/fastBoard';
import { loadHarnessModel, runsEngineSuites } from './helpers/engineHarness';
import type { BoardState, Move } from '../src/types';

// ---------------------------------------------------------------------------
// A whole search, against the one KataGo recorded.
//
// cpp/tests/results/runSearchTestsV8.txt, "TEST EXACT (NO MASKING) VS MASKED": the
// 19x19 Japanese position below, 200 visits, one thread, the net this app bundles,
// and SearchParams::forTestsV1 -- which turns off almost everything this port has on
// by default. Standing those parameters up is the only way to compare a search
// rather than only its inputs.
//
// Two backends will not agree move for move at 200 visits; a hair of difference in
// the network output moves a visit and the tree diverges from there. What can be
// held to is the shape: the same best move, the same opening of the variation, visit
// counts close to KataGo's, and the bookkeeping identities its own numbers show.
// ---------------------------------------------------------------------------

const SGF =
  '(;GM[1]FF[4]CA[UTF-8]RU[Japanese]SZ[19]KM[6.5];B[dd];W[qd];B[pq];W[dp];B[oc];W[pe];B[fq];W[jp];B[ph];W[cf];B[ck])';

// Move, visits, play selection value and the lower confidence bound in centi-utility
// from white's point of view, as KataGo printed them.
const RECORDED: ReadonlyArray<readonly [string, number, number, number]> = [
  ['Q4', 25, 48, -3.09], ['C11', 26, 26, -5.16], ['R5', 26, 26, -4.13], ['C7', 23, 23, -4.42],
  ['Q17', 20, 20, -3.42], ['C6', 15, 15, -5.58], ['O16', 13, 13, -7.17], ['D7', 11, 11, -9.00],
  ['M17', 7, 7, -13.66], ['F17', 5, 5, -29.95], ['N16', 5, 5, -29.18], ['Q5', 5, 4, -30.04],
  ['R4', 4, 4, -45.24], ['D6', 4, 4, -45.21], ['E3', 3, 3, -76.18], ['C17', 2, 2, -156.36],
  ['N17', 2, 2, -152.93], ['Q10', 1, 1, -356.34],
];

// The recorded run randomised the symmetry per evaluation from a fixed seed, which
// cannot be reproduced here: only the root's draw is recoverable, and it is ours
// numbered 7. Every other node in the recorded search was evaluated under some other
// symmetry than the one this search will use, and the network is only approximately
// equivariant -- a single position's value moves by whole centipercent between
// symmetries. That, not any fault in the search, is why the visit counts below
// cannot be expected to line up exactly.
const ROOT_SYMMETRY_THE_RECORDED_RUN_DREW = 7;

const FOR_TESTS_V1 = {
  cpuctExploration: 0.9,
  cpuctExplorationLog: 0.4,
  cpuctUtilityStdevPrior: 0.25,
  cpuctUtilityStdevPriorWeight: 1.0,
  cpuctUtilityStdevScale: 0.0,
  fpuParentWeightByVisitedPolicy: false,
  valueWeightExponent: 0.5,
  useNoisePruning: false,
  useUncertainty: false,
  subtreeValueBiasFactor: 0,
};

const gtpToXy = (label: string): [number, number] => [
  'ABCDEFGHJKLMNOPQRST'.indexOf(label[0]!),
  19 - Number.parseInt(label.slice(1), 10),
];

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

describe.skipIf(!runsEngineSuites())("KataGo's recorded 200 visit search", () => {
  afterEach(() => resetSearchTuning());

  it('reaches the same shape of tree', async () => {
    setBoardSize(19);
    const model = await loadHarnessModel();
    const moves = parseSgfMoves(SGF);
    const board: BoardState = Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => null));
    for (const move of moves) board[move.y]![move.x] = move.player;

    setSearchTuningForTest(FOR_TESTS_V1);
    const search = await MctsSearch.create({
      model,
      board,
      currentPlayer: 'white',
      moveHistory: moves,
      komi: 6.5,
      rules: 'japanese',
      nnRandomize: false,
      conservativePass: true,
      maxChildren: 60,
      ownershipMode: 'root',
      wideRootNoise: 0,
      rootSymmetryPruning: false,
      ignorePreRootHistory: false,
      rootPolicyTemperature: 1.1,
      rootPolicyTemperatureEarly: 1.2,
      rootSymmetry: ROOT_SYMMETRY_THE_RECORDED_RUN_DREW,
      useGraphSearch: false,
      enablePassingHacks: false,
      fillDameBeforePass: false,
    });
    // One playout at a time, as KataGo's single search thread does: batching brings
    // virtual losses in, and those would move visits around on their own.
    await search.run({ visits: 200, maxTimeMs: 300000, batchSize: 1 });
    const analysis = search.getAnalysis({ topK: 60, analysisPvLen: 8 });

    expect(analysis.rootVisits).toBe(200);
    const best = analysis.moves[0]!;
    expect(`${best.x},${best.y}`).toBe(`${gtpToXy('Q4')[0]},${gtpToXy('Q4')[1]}`);
    // KataGo's variation ran Q4 R4 P3 R3 P4 Q6 C11.
    expect(best.pv.slice(0, 4)).toEqual(['Q4', 'R4', 'P3', 'R3']);

    const byPoint = new Map(analysis.moves.map((m) => [`${m.x},${m.y}`, m]));
    let totalVisitDifference = 0;
    for (const [label, visits] of RECORDED) {
      const [x, y] = gtpToXy(label);
      const ours = byPoint.get(`${x},${y}`);
      expect(`${label} searched`).toBe(ours ? `${label} searched` : `${label} missing`);
      totalVisitDifference += Math.abs(ours!.visits - visits);
    }
    // Roughly 200 visits are spread over these moves; KataGo's own numbers and ours
    // differ by a fraction of that, not by a rearrangement.
    expect(totalVisitDifference).toBeLessThan(50);

    // With uncertainty off every visit carries weight one, so a node's weight has to
    // come to its visit count. It did not before the edge visit and the rebuild of
    // the node above it were put in KataGo's order, and every play selection value
    // in the search was distorted by it.
    for (const move of analysis.moves) {
      expect(`${move.x},${move.y} w=${move.weight!.toFixed(4)}`).toBe(
        `${move.x},${move.y} w=${move.visits.toFixed(4)}`
      );
    }
    // KataGo's own dump shows play selection value equal to visits for all but two
    // moves: the one the LCB promotes, which rises, and one the root's retrospective
    // reduction claws back, which falls. Nothing else moves.
    for (const move of analysis.moves) {
      if (move === best) continue;
      expect(`${move.x},${move.y} psv<=n`).toBe(
        move.playSelectionValue <= move.visits + 1e-9 ? `${move.x},${move.y} psv<=n` : `${move.x},${move.y} psv>n`
      );
    }
    expect(best.playSelectionValue).toBeGreaterThan(best.visits);

    // The lower confidence bound is dominated by how many visits a move has, so it
    // is only comparable where the two searches happened to spend the same number.
    // Where they did it agrees closely, which checks the whole of KataGo's
    // getSelfUtilityLCBAndRadius: the variance prior, the effective sample size,
    // and the sign of the perspective.
    let compared = 0;
    for (const [label, visits, , recordedLcb] of RECORDED) {
      const [x, y] = gtpToXy(label);
      const ours = byPoint.get(`${x},${y}`)!;
      if (ours.visits !== visits) continue;
      compared += 1;
      // Ours is reported from black's point of view, and white is to move here.
      const ourLcbCenti = -ours.utilityLcb! * 100;
      const tolerance = Math.max(1.5, Math.abs(recordedLcb) * 0.02);
      expect(`${label} lcb near ${recordedLcb.toFixed(2)}`).toBe(
        Math.abs(ourLcbCenti - recordedLcb) <= tolerance
          ? `${label} lcb near ${recordedLcb.toFixed(2)}`
          : `${label} lcb was ${ourLcbCenti.toFixed(2)}`
      );
    }
    expect(compared).toBeGreaterThanOrEqual(4);
  }, 300000);
});
