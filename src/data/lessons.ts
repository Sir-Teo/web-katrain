import type { BoardState } from '../types';
import type { StaticBoardMarker } from '../components/StaticBoard';

/**
 * Build a square board from an ASCII diagram. Each row must have the same
 * length as the number of rows. Characters: '.' empty, 'x'/'X' black,
 * 'o'/'O' white.
 */
export const boardFromRows = (rows: string[]): BoardState => {
  const size = rows.length;
  return rows.map((row, y) => {
    if (row.length !== size) {
      throw new Error(`Lesson diagram row ${y} has length ${row.length}, expected ${size}`);
    }
    return Array.from(row, (ch) => (ch === 'x' || ch === 'X' ? 'black' : ch === 'o' || ch === 'O' ? 'white' : null));
  });
};

export interface LessonStep {
  text: string;
  rows: string[];
  markers?: StaticBoardMarker[];
  /** Interactive step: clicking one of these intersections is correct. */
  answers?: Array<{ x: number; y: number }>;
  successText?: string;
  hint?: string;
}

export interface Lesson {
  id: string;
  title: string;
  level: 'Beginner' | 'Intermediate';
  summary: string;
  steps: LessonStep[];
}

const EMPTY_9 = [
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
  '.........',
];

export const LESSONS: Lesson[] = [
  {
    id: 'capture',
    title: 'Capturing a stone',
    level: 'Beginner',
    summary: 'A stone with no empty neighbours (liberties) is captured and removed.',
    steps: [
      {
        text: 'Every stone needs liberties — the empty points directly next to it. The circled white stone has just one liberty left, at point A. A stone with one liberty is in “atari”.',
        rows: [
          '.........',
          '.........',
          '.........',
          '...x.....',
          '..xo.....',
          '...x.....',
          '.........',
          '.........',
          '.........',
        ],
        markers: [
          { x: 3, y: 4, kind: 'circle', color: 'rgba(229,62,62,0.9)' },
          { x: 4, y: 4, text: 'A', color: 'rgba(66,153,225,0.85)' },
        ],
      },
      {
        text: 'Black to play. Capture the white stone by filling its last liberty.',
        rows: [
          '.........',
          '.........',
          '.........',
          '...x.....',
          '..xo.....',
          '...x.....',
          '.........',
          '.........',
          '.........',
        ],
        answers: [{ x: 4, y: 4 }],
        successText: 'Captured! With no liberties left, the white stone comes off the board.',
        hint: 'Fill the only empty point touching the white stone, to its right.',
      },
    ],
  },
  {
    id: 'atari',
    title: 'Putting a stone in atari',
    level: 'Beginner',
    summary: 'Atari is the threat to capture next move — reduce a stone to one liberty.',
    steps: [
      {
        text: 'This white stone is pressed on the left and right and has two liberties left, above and below. Black to play: put it in atari by taking one of them.',
        rows: [
          '.........',
          '.........',
          '.........',
          '.........',
          '...xox...',
          '.........',
          '.........',
          '.........',
          '.........',
        ],
        answers: [
          { x: 4, y: 3 },
          { x: 4, y: 5 },
        ],
        successText: 'Atari! The white stone now has a single liberty and can be captured next move.',
        hint: 'Play directly above or below the white stone.',
      },
    ],
  },
  {
    id: 'two-eyes',
    title: 'Two eyes mean life',
    level: 'Beginner',
    summary: 'A group with two separate eyes can never be captured.',
    steps: [
      {
        text: 'An “eye” is an empty point fully surrounded by one colour. This black group has two real eyes (marked), so it is alive forever — White can never fill both at once.',
        rows: [
          '.........',
          '.........',
          '.........',
          '..xxxxx..',
          '..x.x.x..',
          '..xxxxx..',
          '.........',
          '.........',
          '.........',
        ],
        markers: [
          { x: 3, y: 4, text: '✓', color: 'rgba(56,161,105,0.85)' },
          { x: 5, y: 4, text: '✓', color: 'rgba(56,161,105,0.85)' },
        ],
      },
      {
        text: 'This group surrounds three empty points in a row. Black to play: make two eyes with a single stone.',
        rows: [
          '.........',
          '.........',
          '.........',
          '..xxxxx..',
          '..x...x..',
          '..xxxxx..',
          '.........',
          '.........',
          '.........',
        ],
        answers: [{ x: 4, y: 4 }],
        successText: 'Alive! Playing the middle leaves two one-point eyes — the group can never be captured.',
        hint: 'Play the centre of the three empty points.',
      },
    ],
  },
  {
    id: 'opening',
    title: 'Opening: corners first',
    level: 'Beginner',
    summary: 'Territory is easiest to make in the corners, then the sides, then the centre.',
    steps: [
      {
        text: 'Corners need the fewest stones to enclose territory, sides come next, and the centre is hardest. So strong openings start in the corners.',
        rows: EMPTY_9,
        markers: [
          { x: 2, y: 2, color: 'rgba(56,161,105,0.8)' },
          { x: 6, y: 2, color: 'rgba(56,161,105,0.8)' },
          { x: 2, y: 6, color: 'rgba(56,161,105,0.8)' },
          { x: 6, y: 6, color: 'rgba(56,161,105,0.8)' },
          { x: 4, y: 4, text: '✕', color: 'rgba(229,62,62,0.7)' },
        ],
      },
      {
        text: 'The board is empty. Black to play the opening move: choose the most efficient point.',
        rows: EMPTY_9,
        answers: [
          { x: 2, y: 2 },
          { x: 6, y: 2 },
          { x: 2, y: 6 },
          { x: 6, y: 6 },
        ],
        successText: 'Good — a corner point. You enclose territory efficiently and keep good options on both sides.',
        hint: 'Head for a corner star point, not the centre or an edge.',
      },
    ],
  },
];
