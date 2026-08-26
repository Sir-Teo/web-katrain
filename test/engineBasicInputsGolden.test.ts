import { describe, expect, it } from 'vitest';
import { fillInputsV7FastForPosition } from '../src/engine/katago/positionInputsV7';
import { BLACK, BOARD_AREA, BOARD_SIZE, EMPTY, WHITE, playMove, setBoardSize } from '../src/engine/katago/fastBoard';
import type { SimPosition } from '../src/engine/katago/fastBoard';
import {
  KATAGO_BASIC_GLOBAL_V7,
  KATAGO_BASIC_SGF,
  KATAGO_BASIC_SPATIAL_V7,
} from './fixtures/katagoBasicInputsV7';
import type { BoardState, Move } from '../src/types';

// ---------------------------------------------------------------------------
// Every input plane, on a real game, against numbers KataGo printed.
//
// The whole 159 move game is replayed through this engine's own board code, so the
// check covers the move rules and captures as well as the featurizer: liberties,
// the ko point, the five history planes, all four ladder planes, and the pass-alive
// area. If any of that disagreed with KataGo the planes would not line up.
// ---------------------------------------------------------------------------

const SPATIAL_CHANNELS = 22;

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

const toBoardState = (stones: Uint8Array): BoardState =>
  Array.from({ length: BOARD_SIZE }, (_, y) =>
    Array.from({ length: BOARD_SIZE }, (_, x) => {
      const v = stones[y * BOARD_SIZE + x];
      return v === BLACK ? ('black' as const) : v === WHITE ? ('white' as const) : null;
    })
  );

describe("KataGo's recorded input planes for a whole game", () => {
  it('matches on every spatial channel', () => {
    setBoardSize(19);
    const moves = parseSgfMoves(KATAGO_BASIC_SGF);
    expect(moves.length).toBe(159);

    // Replay through the engine's own move code, keeping the last three positions.
    const sim: SimPosition = { stones: new Uint8Array(BOARD_AREA).fill(EMPTY), koPoint: -1 };
    const captureStack: number[] = [];
    const snapshots: Uint8Array[] = [];
    for (const move of moves) {
      snapshots.push(sim.stones.slice());
      playMove(sim, move.y * BOARD_SIZE + move.x, move.player === 'black' ? BLACK : WHITE, captureStack);
      captureStack.length = 0;
    }

    const spatial = new Float32Array(BOARD_AREA * SPATIAL_CHANNELS);
    const global = new Float32Array(19);
    fillInputsV7FastForPosition({
      board: toBoardState(sim.stones),
      previousBoard: toBoardState(snapshots[snapshots.length - 1]!),
      previousPreviousBoard: toBoardState(snapshots[snapshots.length - 2]!),
      currentPlayer: 'white',
      moveHistory: moves,
      komi: 7.5,
      rules: 'chinese',
      conservativePassAndIsRoot: false,
      outSpatial: spatial,
      outGlobal: global,
    });

    for (let channel = 0; channel < SPATIAL_CHANNELS; channel++) {
      const expected = KATAGO_BASIC_SPATIAL_V7[channel]!;
      const wrong: string[] = [];
      for (let p = 0; p < BOARD_AREA; p++) {
        const got = spatial[p * SPATIAL_CHANNELS + channel]!;
        const want = expected[p] === '1' ? 1 : 0;
        if (got !== want) wrong.push(`${p % BOARD_SIZE},${(p / BOARD_SIZE) | 0}: ${got} not ${want}`);
      }
      expect(`channel ${channel}: ${wrong.slice(0, 4).join('; ')}`).toBe(`channel ${channel}: `);
    }
  });

  it('matches on every global that does not describe a ruleset we lack', () => {
    setBoardSize(19);
    const moves = parseSgfMoves(KATAGO_BASIC_SGF);
    const sim: SimPosition = { stones: new Uint8Array(BOARD_AREA).fill(EMPTY), koPoint: -1 };
    const captureStack: number[] = [];
    const snapshots: Uint8Array[] = [];
    for (const move of moves) {
      snapshots.push(sim.stones.slice());
      playMove(sim, move.y * BOARD_SIZE + move.x, move.player === 'black' ? BLACK : WHITE, captureStack);
      captureStack.length = 0;
    }

    const spatial = new Float32Array(BOARD_AREA * SPATIAL_CHANNELS);
    const global = new Float32Array(19);
    fillInputsV7FastForPosition({
      board: toBoardState(sim.stones),
      previousBoard: toBoardState(snapshots[snapshots.length - 1]!),
      previousPreviousBoard: toBoardState(snapshots[snapshots.length - 2]!),
      currentPlayer: 'white',
      moveHistory: moves,
      komi: 7.5,
      rules: 'chinese',
      conservativePassAndIsRoot: false,
      outSpatial: spatial,
      outGlobal: global,
    });

    // 6 and 7 say positional superko and 8 says multi-stone suicide is legal, which
    // are Tromp-Taylor's rules rather than the two rulesets this port offers.
    const rulesetSpecific = new Set([6, 7, 8]);
    for (let c = 0; c < KATAGO_BASIC_GLOBAL_V7.length; c++) {
      if (rulesetSpecific.has(c)) continue;
      expect(`${c}:${global[c]!.toFixed(4)}`).toBe(`${c}:${KATAGO_BASIC_GLOBAL_V7[c]!.toFixed(4)}`);
    }
  });
});
