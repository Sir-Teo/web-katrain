import { describe, expect, it } from 'vitest';
import type { AnalysisResult, GameNode, GameState, Move } from '../src/types';
import {
  findMistakeNavigationTarget,
  getMistakeNavigationAvailability,
} from '../src/utils/mistakeNavigation';

const state = (): GameState => ({
  board: [[null]],
  currentPlayer: 'black',
  moveHistory: [],
  capturedBlack: 0,
  capturedWhite: 0,
  komi: 6.5,
});

// No root score, so points lost come from the candidate list: a score of 0
// on every position would say no move lost anything.
const analysis = (move: Move, pointsLost: number): AnalysisResult => ({
  rootScoreLead: Number.NaN,
  rootWinRate: 0.5,
  territory: [[0]],
  moves: [{ ...move, winRate: 0.5, scoreLead: 0, visits: 100, pointsLost, order: 0 }],
});

const child = (id: string, parent: GameNode, move: Move, pointsLost: number): GameNode => {
  parent.analysis = analysis(move, pointsLost);
  const node: GameNode = { id, parent, children: [], move, gameState: state() };
  parent.children.push(node);
  return node;
};

describe('mistake navigation', () => {
  it('exposes only directions that lead to an analyzed mistake', () => {
    const root: GameNode = { id: 'root', parent: null, children: [], move: null, gameState: state() };
    const good = child('good', root, { x: 0, y: 0, player: 'black' }, 0.5);
    const mistake = child('mistake', good, { x: 1, y: 0, player: 'white' }, 4);
    const tail = child('tail', mistake, { x: 2, y: 0, player: 'black' }, 0.5);

    expect(getMistakeNavigationAvailability({ currentNode: root, threshold: 3 })).toEqual({ previous: false, next: true });
    expect(findMistakeNavigationTarget({ currentNode: root, direction: 'redo', threshold: 3 })).toBe(good);
    expect(getMistakeNavigationAvailability({ currentNode: good, threshold: 3 })).toEqual({ previous: false, next: false });
    expect(getMistakeNavigationAvailability({ currentNode: mistake, threshold: 3 })).toEqual({ previous: true, next: false });
    expect(findMistakeNavigationTarget({ currentNode: mistake, direction: 'undo', threshold: 3 })).toBe(good);
    expect(getMistakeNavigationAvailability({ currentNode: tail, threshold: 3 })).toEqual({ previous: true, next: false });
  });

  it('follows the active branch when deciding whether next is available', () => {
    const root: GameNode = { id: 'root', parent: null, children: [], move: null, gameState: state() };
    const quiet = child('quiet', root, { x: 0, y: 0, player: 'black' }, 0.5);
    const alternate = child('alternate', root, { x: 1, y: 0, player: 'black' }, 0.5);
    child('mistake', alternate, { x: 0, y: 1, player: 'white' }, 4);
    root.analysis = {
      ...analysis(quiet.move!, 0.5),
      moves: [analysis(quiet.move!, 0.5).moves[0]!, analysis(alternate.move!, 0.5).moves[0]!],
    };

    expect(getMistakeNavigationAvailability({ currentNode: root, threshold: 3 })).toEqual({ previous: false, next: false });
    expect(getMistakeNavigationAvailability({
      currentNode: root,
      activeBranchChildIds: { root: alternate.id },
      threshold: 3,
    })).toEqual({ previous: false, next: true });
    expect(quiet.id).toBe('quiet');
  });

  it('ignores pass moves and positions without parent analysis', () => {
    const root: GameNode = { id: 'root', parent: null, children: [], move: null, gameState: state() };
    const pass = child('pass', root, { x: -1, y: -1, player: 'black' }, 9);
    child('unanalyzed', pass, { x: 0, y: 0, player: 'white' }, 0);
    pass.analysis = undefined;

    expect(getMistakeNavigationAvailability({ currentNode: root, threshold: 3 })).toEqual({ previous: false, next: false });
  });

  it('walks on to the next mistake from the position before the last one', () => {
    const root: GameNode = { id: 'root', parent: null, children: [], move: null, gameState: state() };
    const p1 = child('p1', root, { x: 0, y: 0, player: 'black' }, 0.5);
    const m1 = child('m1', p1, { x: 1, y: 0, player: 'white' }, 4);
    const p2 = child('p2', m1, { x: 2, y: 0, player: 'black' }, 0.5);
    child('m2', p2, { x: 3, y: 0, player: 'white' }, 7);

    expect(findMistakeNavigationTarget({ currentNode: root, direction: 'redo', threshold: 3 })).toBe(p1);
    expect(findMistakeNavigationTarget({ currentNode: p1, direction: 'redo', threshold: 3 })).toBe(p2);
    expect(getMistakeNavigationAvailability({ currentNode: p1, threshold: 3 }).next).toBe(true);
  });

  it('measures a mistake by the score change across the move when both sides have one', () => {
    const root: GameNode = { id: 'root', parent: null, children: [], move: null, gameState: state() };
    const listed = child('listed', root, { x: 0, y: 0, player: 'black' }, 0);
    const unlisted: GameNode = { id: 'unlisted', parent: listed, children: [], move: { x: 5, y: 5, player: 'white' }, gameState: state() };
    listed.children.push(unlisted);
    listed.analysis = { ...analysis({ x: 0, y: 0, player: 'white' }, 0), rootScoreLead: 2 };
    unlisted.analysis = { ...analysis({ x: 0, y: 0, player: 'black' }, 0), rootScoreLead: 12 };

    // White's move handed Black ten points; it is not in the candidate list.
    expect(findMistakeNavigationTarget({ currentNode: unlisted, direction: 'undo', threshold: 6 })).toBe(listed);
  });
});
