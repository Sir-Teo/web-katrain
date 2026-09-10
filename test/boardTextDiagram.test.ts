import { describe, expect, it } from 'vitest';
import { formatBoardTextDiagram } from '../src/utils/boardTextDiagram';
import { boardFromRows } from '../src/data/lessons';
import { createEmptyBoard, getHoshiPoints } from '../src/utils/boardSize';
import type { BoardSize, BoardState } from '../src/types';

const SIZES: BoardSize[] = [9, 13, 19];

/** The grid alone: labels and spacing stripped, the way a parser would want it. */
const gridRows = (diagram: string, size: number): string[] =>
  diagram
    .split('\n')
    .slice(1, 1 + size)
    .map((line) => line.trim().replace(/^\d+\s+/, '').replace(/\s+\d+$/, '').replace(/ /g, ''));

describe('formatBoardTextDiagram', () => {
  it('draws an empty 9x9 with its star points and both coordinate rows', () => {
    const diagram = formatBoardTextDiagram({ board: createEmptyBoard(9) });

    expect(diagram).toBe(
      [
        '  A B C D E F G H J',
        '9 . . . . . . . . . 9',
        '8 . . . . . . . . . 8',
        '7 . . + . . . + . . 7',
        '6 . . . . . . . . . 6',
        '5 . . . . + . . . . 5',
        '4 . . . . . . . . . 4',
        '3 . . + . . . + . . 3',
        '2 . . . . . . . . . 2',
        '1 . . . . . . . . . 1',
        '  A B C D E F G H J',
      ].join('\n'),
    );
  });

  it('skips I in the column header, like the board does', () => {
    const header = formatBoardTextDiagram({ board: createEmptyBoard(19) }).split('\n')[0];

    expect(header).toBe('   A B C D E F G H J K L M N O P Q R S T');
    expect(header).not.toContain('I');
  });

  it('numbers rows from the bottom on both sides', () => {
    const lines = formatBoardTextDiagram({ board: createEmptyBoard(19) }).split('\n');

    expect(lines[1].startsWith('19 ')).toBe(true);
    expect(lines[1].endsWith(' 19')).toBe(true);
    // Right-aligned, so single digits line up under the tens.
    expect(lines[19].startsWith(' 1 ')).toBe(true);
  });

  it('never leaves a line with trailing whitespace', () => {
    for (const size of SIZES) {
      for (const line of formatBoardTextDiagram({ board: createEmptyBoard(size) }).split('\n')) {
        expect(line, `size ${size}`).toBe(line.replace(/\s+$/, ''));
      }
    }
  });

  it('parses back into the same board through the lesson diagram reader', () => {
    for (const size of SIZES) {
      const board: BoardState = createEmptyBoard(size);
      board[0]![0] = 'black';
      board[size - 1]![size - 1] = 'white';
      board[2]![3] = 'white';
      // A stone on a star point has to win over the star glyph.
      const [starX, starY] = getHoshiPoints(size)[0]!;
      board[starY]![starX] = 'black';

      const diagram = formatBoardTextDiagram({ board });
      expect(boardFromRows(gridRows(diagram, size)), `size ${size}`).toEqual(board);
    }
  });

  it('captions the position with only the facts it was given', () => {
    const bare = formatBoardTextDiagram({ board: createEmptyBoard(9) });
    expect(bare).not.toContain('to play');
    expect(bare.endsWith('A B C D E F G H J')).toBe(true);

    const full = formatBoardTextDiagram({
      board: createEmptyBoard(19),
      toPlay: 'white',
      lastMove: { x: 15, y: 3, player: 'black' },
      // Three black stones were taken, so it is White who holds three.
      captured: { black: 3, white: 0 },
      komi: 6.5,
    });
    expect(full).toContain('White to play. Last move: Black Q16. Prisoners: Black 0, White 3. Komi 6.5.');

    // Nobody has taken anything yet, so the line has nothing to say.
    const noPrisoners = formatBoardTextDiagram({
      board: createEmptyBoard(19),
      captured: { black: 0, white: 0 },
      komi: 7,
    });
    expect(noPrisoners).not.toContain('Prisoners');
    expect(noPrisoners).toContain('Komi 7.');
  });

  it('writes a pass as a pass rather than a point', () => {
    const diagram = formatBoardTextDiagram({
      board: createEmptyBoard(19),
      lastMove: { x: -1, y: -1, player: 'white' },
    });

    expect(diagram).toContain('Last move: White pass.');
  });
});
