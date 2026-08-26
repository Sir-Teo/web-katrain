import { beforeEach, describe, expect, it } from 'vitest';
import { MctsSearch } from '../src/engine/katago/analyzeMcts';
import { extractInputsV7Fast, type RecentMove } from '../src/engine/katago/featuresV7Fast';
import { BOARD_AREA, BOARD_SIZE, PASS_MOVE, setBoardSize } from '../src/engine/katago/fastBoard';
import { boardFromDiagram, hasModel, loadHarnessModel } from './helpers/engineHarness';
import type { GameRules, Move } from '../src/types';

// ---------------------------------------------------------------------------
// enablePassingHacks (cpp/neuralnet/nninputs.cpp), on by default for KataGo's
// analysis and GTP setups.
//
// When a pass would end the game and ending it right now would not be a win, the
// net is told that passing does not end anything. A losing side then keeps looking
// for something better instead of settling for the score it would concede. Only
// area scoring can price the board that way without agreeing dead stones first,
// which is why the hack is silent under territory rules.
// ---------------------------------------------------------------------------

// Black owns the left three columns, white the right five, with one open column
// between. Each side has an eye, so both are alive.
const BLACK_LOSING = `
  XXX.OOOOO
  X.X.OO.OO
  XXX.OOOOO
  XXX.OOOOO
  XXX.OOOOO
  XXX.OOOOO
  XXX.OOOOO
  XXX.OOOOO
  XXX.OOOOO
`;
// The same board with the colours swapped, so black is comfortably ahead.
const BLACK_WINNING = BLACK_LOSING.replace(/X/g, 'x').replace(/O/g, 'X').replace(/x/g, 'O');

const stonesFrom = (diagram: string): Uint8Array => {
  const stones = new Uint8Array(BOARD_AREA);
  diagram
    .trim()
    .split('\n')
    .forEach((row, y) => {
      row
        .trim()
        .split('')
        .forEach((c, x) => {
          if (c === 'X') stones[y * BOARD_SIZE + x] = 1;
          else if (c === 'O') stones[y * BOARD_SIZE + x] = 2;
        });
    });
  return stones;
};

const inputsAfterPass = (args: {
  diagram: string;
  enablePassingHacks: boolean;
  rules?: GameRules;
  conservativePassAndIsRoot?: boolean;
}) => {
  const afterOpponentPass: RecentMove[] = [{ move: PASS_MOVE, player: 'white' }];
  return extractInputsV7Fast({
    stones: stonesFrom(args.diagram),
    koPoint: -1,
    currentPlayer: 'black',
    recentMoves: afterOpponentPass,
    komi: 7,
    rules: args.rules ?? 'chinese',
    conservativePassAndIsRoot: args.conservativePassAndIsRoot,
    enablePassingHacks: args.enablePassingHacks,
  });
};

describe('passing hacks in the network input', () => {
  beforeEach(() => setBoardSize(9));

  it('hides the end of the game from a side that would lose by ending it', () => {
    const hacked = inputsAfterPass({ diagram: BLACK_LOSING, enablePassingHacks: true });
    // Told that passing settles nothing, and the opponent's pass is hidden too.
    expect(hacked.global[14]).toBe(0);
    expect(hacked.global[0]).toBe(0);
  });

  it('leaves the position alone without the hack', () => {
    const plain = inputsAfterPass({ diagram: BLACK_LOSING, enablePassingHacks: false });
    expect(plain.global[14]).toBe(1);
    expect(plain.global[0]).toBe(1);
  });

  it('leaves a winning side to end the game if it wants to', () => {
    const winning = inputsAfterPass({ diagram: BLACK_WINNING, enablePassingHacks: true });
    expect(winning.global[14]).toBe(1);
    expect(winning.global[0]).toBe(1);
  });

  it('counts the komi on the losing side of the comparison', () => {
    // Same board both ways: with 7 komi against it black is behind, and a komi
    // large enough to swing the count the other way turns the hack off.
    const base = {
      stones: stonesFrom(BLACK_WINNING),
      koPoint: -1,
      currentPlayer: 'black' as const,
      recentMoves: [{ move: PASS_MOVE, player: 'white' as const }],
      rules: 'chinese' as const,
      enablePassingHacks: true,
    };
    expect(extractInputsV7Fast({ ...base, komi: 7 }).global[14]).toBe(1);
    expect(extractInputsV7Fast({ ...base, komi: 60 }).global[14]).toBe(0);
  });

  it('stays out of it under territory rules, where the board cannot be counted yet', () => {
    const japanese = inputsAfterPass({ diagram: BLACK_LOSING, enablePassingHacks: true, rules: 'japanese' });
    expect(japanese.global[14]).toBe(1);
  });

  it('is one of two reasons to suppress, not the only one', () => {
    // conservativePassAndIsRoot suppresses whichever way the game is going.
    const winningAtRoot = inputsAfterPass({
      diagram: BLACK_WINNING,
      enablePassingHacks: false,
      conservativePassAndIsRoot: true,
    });
    expect(winningAtRoot.global[14]).toBe(0);
  });
});

describe.skipIf(!hasModel())('passing hacks reach the search', () => {
  const rootEval = async (args: { enablePassingHacks: boolean; conservativePass: boolean }) => {
    setBoardSize(9);
    const model = await loadHarnessModel();
    const moveHistory: Move[] = [{ x: -1, y: -1, player: 'white' }];
    const search = await MctsSearch.create({
      model,
      board: boardFromDiagram(BLACK_LOSING),
      currentPlayer: 'black',
      moveHistory,
      komi: 7,
      rules: 'chinese',
      nnRandomize: false,
      conservativePass: args.conservativePass,
      maxChildren: 20,
      ownershipMode: 'root',
      wideRootNoise: 0,
      // The root would otherwise have no history planes at all, which is the very
      // thing the hack also suppresses.
      ignorePreRootHistory: false,
      enablePassingHacks: args.enablePassingHacks,
    });
    return search.getAnalysis({ topK: 1, analysisPvLen: 1 });
  };

  it('changes what a losing root sees', async () => {
    const hacked = await rootEval({ enablePassingHacks: true, conservativePass: false });
    const plain = await rootEval({ enablePassingHacks: false, conservativePass: false });
    expect(Math.abs(hacked.rootWinRate - plain.rootWinRate)).toBeGreaterThan(0);
  }, 120000);

  it('adds nothing where conservative passing already suppressed it', async () => {
    const hacked = await rootEval({ enablePassingHacks: true, conservativePass: true });
    const plain = await rootEval({ enablePassingHacks: false, conservativePass: true });
    expect(hacked.rootWinRate).toBeCloseTo(plain.rootWinRate, 12);
  }, 120000);
});
