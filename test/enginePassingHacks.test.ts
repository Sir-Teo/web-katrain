import { beforeEach, describe, expect, it } from 'vitest';
import { MctsSearch } from '../src/engine/katago/analyzeMcts';
import { extractInputsV7Fast, type RecentMove } from '../src/engine/katago/featuresV7Fast';
import { BOARD_AREA, BOARD_SIZE, PASS_MOVE, setBoardSize } from '../src/engine/katago/fastBoard';
import { boardFromDiagram, loadHarnessModel, runsEngineSuites } from './helpers/engineHarness';
import type { GameRules, Move } from '../src/types';

// KataGo suppresses ordinary area-game endings for conservative root search,
// friendly passing, or a losing/drawing player with passing hacks enabled.
// Tromp–Taylor disables friendly passing; territory phase zero is not a game end.
// Recorded reference histories are covered in enginePassHistory.test.ts.

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

describe('hiding the end of the game', () => {
  beforeEach(() => setBoardSize(9));

  it('hides the first Chinese pass whoever is winning', () => {
    // Friendly passing makes this unconditional under Chinese rules: the net is
    // never told that this pass settles anything, whichever way the game is going.
    for (const diagram of [BLACK_LOSING, BLACK_WINNING]) {
      for (const enablePassingHacks of [false, true]) {
        const inputs = inputsAfterPass({ diagram, enablePassingHacks });
        expect(inputs.global[14]).toBe(0);
        expect(inputs.global[0]).toBe(0);
      }
    }
  });

  it('leaves territory scoring to say what it means', () => {
    // Japanese rules set friendlyPassOk false and build no area feature, so neither
    // of the two unconditional reasons applies and the pass is shown as it is.
    const japanese = inputsAfterPass({ diagram: BLACK_LOSING, enablePassingHacks: true, rules: 'japanese' });
    expect(japanese.global[14]).toBe(1);
    expect(japanese.global[0]).toBe(1);
  });

  it('preserves territory phase-zero history even with conservative passing', () => {
    const japanese = inputsAfterPass({
      diagram: BLACK_WINNING,
      enablePassingHacks: false,
      rules: 'japanese',
      conservativePassAndIsRoot: true,
    });
    expect(japanese.global[14]).toBe(1);
  });

  it('keeps winning Tromp–Taylor history and hides a loss only when passing hacks are enabled', () => {
    for (const enablePassingHacks of [false, true]) {
      const winning = inputsAfterPass({ diagram: BLACK_WINNING, rules: 'tromp-taylor', enablePassingHacks });
      const losing = inputsAfterPass({ diagram: BLACK_LOSING, rules: 'tromp-taylor', enablePassingHacks });
      expect(winning.global[0]).toBe(1);
      expect(winning.global[14]).toBe(1);
      expect(losing.global[0]).toBe(enablePassingHacks ? 0 : 1);
      expect(losing.global[14]).toBe(enablePassingHacks ? 0 : 1);
    }
  });

  it('says nothing about a pass that would not end anything', () => {
    // No pass behind us, so there is nothing to hide either way.
    const inputs = extractInputsV7Fast({
      stones: stonesFrom(BLACK_LOSING),
      koPoint: -1,
      currentPlayer: 'black',
      recentMoves: [{ move: 3, player: 'white' }],
      komi: 7,
      rules: 'chinese',
      enablePassingHacks: true,
    });
    expect(inputs.global[14]).toBe(0);
    expect(inputs.global[0]).toBe(0);
  });
});

describe.skipIf(!runsEngineSuites())('the suppression reaches the search', () => {
  const rootEval = async (rules: GameRules, conservativePass: boolean, diagram = BLACK_LOSING) => {
    setBoardSize(9);
    const model = await loadHarnessModel();
    const moveHistory: Move[] = [{ x: -1, y: -1, player: 'white' }];
    const search = await MctsSearch.create({
      model,
      board: boardFromDiagram(diagram),
      currentPlayer: 'black',
      moveHistory,
      komi: 7,
      rules,
      nnRandomize: false,
      conservativePass,
      maxChildren: 20,
      ownershipMode: 'root',
      wideRootNoise: 0,
      // The root would otherwise have no history planes at all, which is one of the
      // things being suppressed here.
      ignorePreRootHistory: false,
    });
    return search.getAnalysis({ topK: 1, analysisPvLen: 1 });
  };

  it('changes what a root one pass from the end sees under area scoring', async () => {
    // Conservative passing only changes the area game-end condition. Japanese
    // normal-phase inputs stay identical; winning Tromp–Taylor exposes the option.
    const chinese = await rootEval('chinese', false);
    const japanese = await rootEval('japanese', false);
    const japaneseConservative = await rootEval('japanese', true);
    expect(japanese.rootWinRate).toBe(japaneseConservative.rootWinRate);
    expect((await rootEval('tromp-taylor', false, BLACK_WINNING)).rootWinRate)
      .not.toBe((await rootEval('tromp-taylor', true, BLACK_WINNING)).rootWinRate);
    expect(chinese.rootWinRate).toBe((await rootEval('chinese', true)).rootWinRate);
  }, 120000);
});
