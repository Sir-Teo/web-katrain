import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { analysisQueue } from '../src/utils/analysisQueue';
import { parseSgf } from '../src/utils/sgf';

/**
 * A move the current ruleset will not play stops its line dead: the loader has
 * no node to hang the rest on, so it drops that move and everything after it.
 * Nothing throws and nothing is logged, so a 300-move record could arrive as a
 * 218-move game with no explanation at all -- and exporting it afterwards would
 * write the short version back out.
 *
 * The load still stops there; what changed is that it now says so.
 */
const mainLineLength = (): number => {
  useGameStore.getState().navigateEnd();
  let depth = 0;
  let node = useGameStore.getState().currentNode;
  while (node.parent) {
    depth += 1;
    node = node.parent;
  }
  return depth;
};

const load = (sgf: string) => useGameStore.getState().loadGame(parseSgf(sgf));

// Black surrounds (1,1); White playing there captures nothing and has no
// liberty, which is suicide and illegal under Japanese rules.
const SUICIDE_AT_MOVE_8 =
  '(;GM[1]FF[4]SZ[19]KM[6.5]' +
  ';B[ba];W[ss];B[ab];W[sr];B[cb];W[rs];B[bc]' +
  ';W[bb]' +
  ';B[aa];W[ca])';

describe('loading an SGF that holds an illegal move', () => {
  beforeEach(() => {
    analysisQueue.cancelWhere(() => true, 'test reset');
    analysisQueue.clearCache();
    useGameStore.getState().resetGame();
    useGameStore.setState({ notification: null, sgfLoadWarning: null });
  });

  it('says nothing about a game that loads whole', () => {
    load('(;GM[1]FF[4]SZ[19]KM[6.5];B[pd];W[dp];B[pp];W[dd])');
    expect(mainLineLength()).toBe(4);
    expect(useGameStore.getState().sgfLoadWarning).toBeNull();
  });

  it('names the move it stopped at and how much was left behind', () => {
    load(SUICIDE_AT_MOVE_8);

    // The truncation itself is unchanged -- seven of ten moves.
    expect(mainLineLength()).toBe(7);

    const warning = useGameStore.getState().sgfLoadWarning ?? '';
    // Move number, colour and point, in the app's own coordinate convention:
    // column letters skip I, and row 1 is at the bottom, so (1,1) on 19x19 is
    // B18.
    expect(warning).toContain('Move 8 (White B18)');
    expect(warning).toContain('Japanese');
    // Ten moves in the file, seven loaded: the illegal one plus two after it.
    expect(warning).toContain('It and the 2 moves after it were not loaded.');
  });

  it('counts every move it dropped, not just the first', () => {
    // Same position, but with a longer tail behind the illegal move.
    const longer = SUICIDE_AT_MOVE_8.replace(';B[aa];W[ca])', ';B[aa];W[ca];B[da];W[ea];B[fa])');
    load(longer);
    expect(mainLineLength()).toBe(7);
    expect(useGameStore.getState().sgfLoadWarning).toContain('the 5 moves after it');
  });

  it('uses the singular when only the illegal move itself is lost', () => {
    const justOne = SUICIDE_AT_MOVE_8.replace(';B[aa];W[ca])', ')');
    load(justOne);
    expect(useGameStore.getState().sgfLoadWarning).toContain('It was not loaded.');
  });

  it('reports a game whose very first move is illegal', () => {
    // A stone is set up at the point, so Black's first move is onto it.
    load('(;GM[1]FF[4]SZ[19]KM[6.5]AB[dd];B[dd];W[pp];B[qq])');
    expect(mainLineLength()).toBe(0);
    expect(useGameStore.getState().sgfLoadWarning).toContain('Move 1 (Black D16)');
  });

  it('clears the warning when the next game loads cleanly', () => {
    load(SUICIDE_AT_MOVE_8);
    expect(useGameStore.getState().sgfLoadWarning).not.toBeNull();
    load('(;GM[1]FF[4]SZ[19]KM[6.5];B[pd];W[dp])');
    expect(useGameStore.getState().sgfLoadWarning).toBeNull();
  });
  it('reads "1 move" as a move', () => {
    const two = SUICIDE_AT_MOVE_8.replace(';B[aa];W[ca])', ';B[aa])');
    load(two);
    expect(useGameStore.getState().sgfLoadWarning).toContain('It and the move after it were not loaded.');
  });
});

/**
 * The warning must not fire on a file that is simply played under other rules.
 * Black encloses (1,1) and (2,1); White fills both, and the second fills its own
 * group's last liberty while capturing nothing. That is multi-stone suicide:
 * legal in New Zealand, illegal everywhere else this app implements -- and
 * illegal even in New Zealand if it were a lone stone, which is why the plain
 * single-stone case cannot tell these rulesets apart.
 */
describe('honouring the ruleset the file declares', () => {
  const MULTI_STONE_SUICIDE =
    'AB[ab][ba][bc][db][ca][cc];W[bb];B[ss];W[cb];B[sr])';
  const withRules = (ru: string) =>
    `(;GM[1]FF[4]SZ[19]KM[6.5]RU[${ru}]${MULTI_STONE_SUICIDE}`;

  beforeEach(() => {
    analysisQueue.cancelWhere(() => true, 'test reset');
    analysisQueue.clearCache();
    useGameStore.getState().resetGame();
    useGameStore.setState({ notification: null, sgfLoadWarning: null });
  });

  it('loads the whole game, silently, when the file says New Zealand', () => {
    load(withRules('NZ'));
    expect(mainLineLength()).toBe(4);
    expect(useGameStore.getState().sgfLoadWarning).toBeNull();
  });

  it('stops on the same move under rules that forbid it', () => {
    for (const ru of ['Japanese', 'Chinese', 'AGA']) {
      useGameStore.getState().resetGame();
      useGameStore.setState({ sgfLoadWarning: null });
      load(withRules(ru));
      expect(mainLineLength(), ru).toBe(2);
      expect(useGameStore.getState().sgfLoadWarning, ru).toContain('Move 3 (White C18)');
    }
  });
});
