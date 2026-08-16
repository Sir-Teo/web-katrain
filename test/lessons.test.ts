import { describe, expect, it } from 'vitest';
import { LESSONS, boardFromRows } from '../src/data/lessons';
import { applyCapturesInPlace, getLiberties } from '../src/utils/gameLogic';
import type { Player } from '../src/types';

const lessonById = (id: string) => {
  const lesson = LESSONS.find((l) => l.id === id);
  if (!lesson) throw new Error(`Missing lesson ${id}`);
  return lesson;
};

describe('lesson diagrams', () => {
  it('parses square diagrams with the right stone counts', () => {
    const board = boardFromRows(['x.o', '...', 'o.x']);
    expect(board.length).toBe(3);
    expect(board[0]).toEqual(['black', null, 'white']);
    expect(board[2]).toEqual(['white', null, 'black']);
  });

  it('only names labels the same step actually draws', () => {
    for (const lesson of LESSONS) {
      lesson.steps.forEach((step, index) => {
        const drawn = new Set((step.markers ?? []).flatMap((m) => (m.text ? [m.text] : [])));
        const named = [...step.text.matchAll(/\bpoint ([A-Z])\b/g)].map((m) => m[1]!);
        for (const label of named) {
          expect(
            drawn.has(label),
            `${lesson.id} step ${index + 1} tells the reader about point ${label} but never labels it`
          ).toBe(true);
        }
      });
    }
  });

  it('answers are always on empty intersections', () => {
    for (const lesson of LESSONS) {
      for (const step of lesson.steps) {
        const board = boardFromRows(step.rows);
        for (const a of step.answers ?? []) {
          expect(board[a.y]![a.x]).toBeNull();
        }
      }
    }
  });
});

describe('lesson solutions are tactically correct', () => {
  it('capture: the answer removes the white stone', () => {
    const step = lessonById('capture').steps[1]!;
    const board = boardFromRows(step.rows);
    const a = step.answers![0]!;
    board[a.y]![a.x] = 'black';
    const removed = applyCapturesInPlace(board, a.x, a.y, 'black');
    expect(removed.length).toBeGreaterThan(0);
    // The white stone sat just left of the captured liberty.
    expect(board[4]![3]).toBeNull();
  });

  it('atari: each answer leaves the white stone with exactly one liberty', () => {
    const step = lessonById('atari').steps[0]!;
    for (const a of step.answers!) {
      const board = boardFromRows(step.rows);
      board[a.y]![a.x] = 'black';
      const { liberties } = getLiberties(board, 4, 4); // white stone location
      expect(liberties).toBe(1);
    }
  });

  it('two eyes: the answer leaves two empty points each surrounded by black', () => {
    const step = lessonById('two-eyes').steps[1]!;
    const board = boardFromRows(step.rows);
    const a = step.answers![0]!;
    board[a.y]![a.x] = 'black';
    const eyes = [
      { x: 3, y: 4 },
      { x: 5, y: 4 },
    ];
    for (const eye of eyes) {
      expect(board[eye.y]![eye.x]).toBeNull();
      const neighbors: Array<[number, number]> = [
        [eye.x - 1, eye.y],
        [eye.x + 1, eye.y],
        [eye.x, eye.y - 1],
        [eye.x, eye.y + 1],
      ];
      for (const [nx, ny] of neighbors) {
        expect(board[ny]![nx] as Player).toBe('black');
      }
    }
  });
});
