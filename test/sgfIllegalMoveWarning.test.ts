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
    // A lone stone with no liberty is suicide under every ruleset here, so the
    // sentence must not blame the one in force. It used to read "is not legal
    // under Japanese rules", which sent the reader to a setting that would not
    // have loaded the file.
    expect(warning).toContain('single-stone suicide');
    expect(warning).not.toContain('Japanese');
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


/**
 * Why the move was refused, said out loud.
 *
 * All four of these used to render as "is not legal under <ruleset> rules",
 * which is true of exactly one of them. The other three are illegal under every
 * ruleset this app offers, so naming the ruleset pointed the reader at a
 * setting that could not have helped.
 */
describe('naming the reason a move was refused', () => {
  beforeEach(() => {
    analysisQueue.cancelWhere(() => true, 'test reset');
    analysisQueue.clearCache();
    useGameStore.getState().resetGame();
    useGameStore.setState({ notification: null, sgfLoadWarning: null });
  });

  const warningFor = (sgf: string): string => {
    load(sgf);
    return useGameStore.getState().sgfLoadWarning ?? '';
  };

  it('says a point is taken when the move lands on a stone', () => {
    const warning = warningFor('(;GM[1]FF[4]SZ[19]KM[6.5];B[cf];W[ch];B[cc];W[cf];B[dd])');
    expect(warning).toContain('Move 4 (White C14)');
    expect(warning).toContain('plays on a point that already holds a stone');
    expect(warning).not.toContain('Japanese');
  });

  it('names the ko rule when the move takes the position back', () => {
    // White captures at C8; Black retaking D8 at once would restore the board
    // exactly as it stood before the capture.
    const warning = warningFor(
      '(;GM[1]FF[4]SZ[9]KM[6.5]AB[bb][ca][cc][db]AW[da][eb][dc];W[cb];B[db];W[ee])'
    );
    expect(warning).toContain('Move 2 (Black D8)');
    expect(warning).toContain('which the ko rule forbids');
    expect(warning).not.toContain('Japanese');
  });

  it('says no ruleset allows a one-stone suicide', () => {
    const warning = warningFor('(;GM[1]FF[4]SZ[9]KM[6.5]RU[Japanese]AW[aa][ca][bb];W[ii];B[ba];W[hh])');
    expect(warning).toContain('is a single-stone suicide, which no ruleset allows');
    expect(warning).not.toContain('Japanese');
  });

  it('names the ruleset only when the ruleset is the reason, and offers the way out', () => {
    const sgf = (ru: string) =>
      `(;GM[1]FF[4]SZ[9]KM[6.5]RU[${ru}]AB[aa]AW[ab][ca][bb];W[ii];B[ba];W[hh])`;

    const warning = warningFor(sgf('Japanese'));
    expect(warning).toContain('is a multi-stone suicide, which Japanese rules forbid');
    expect(warning).toContain('New Zealand and Tromp-Taylor rules allow it');

    // And the advice is true: the same file under one of those rulesets loads
    // whole. A message that names a setting has to be worth acting on.
    useGameStore.getState().resetGame();
    useGameStore.setState({ sgfLoadWarning: null });
    load(sgf('NZ'));
    expect(mainLineLength()).toBe(3);
    expect(useGameStore.getState().sgfLoadWarning).toBeNull();
  });
});
