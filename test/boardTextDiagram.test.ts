import { describe, expect, it } from 'vitest';
import {
  formatBoardNoteBlock,
  formatBoardTextDiagram,
  parseBoardTextDiagram,
  sgfFromBoardTextDiagram,
} from '../src/utils/boardTextDiagram';
import { parseNoteBlocks } from '../src/utils/notePreview';
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

describe('parseBoardTextDiagram', () => {
  it('reads back everything this app prints', () => {
    for (const size of SIZES) {
      const board: BoardState = createEmptyBoard(size);
      board[0]![0] = 'black';
      board[size - 1]![size - 1] = 'white';
      board[2]![3] = 'white';

      const diagram = formatBoardTextDiagram({ board, toPlay: 'white', komi: 6.5 });

      expect(parseBoardTextDiagram(diagram), `size ${size}`).toEqual(board);
    }
  });

  it('reads a bare grid with no labels, the way a forum post carries one', () => {
    const rows = [
      '.........',
      '..X......',
      '.........',
      '....O....',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
    ];

    const board = parseBoardTextDiagram(rows.join('\n'));

    expect(board?.length).toBe(9);
    expect(board?.[1]?.[2]).toBe('black');
    expect(board?.[3]?.[4]).toBe('white');
  });

  it('takes the glyphs other tools use', () => {
    // Star points are drawn with several characters and none of them means a
    // stone; '#' and '@' for black and '0' for white all appear in the wild.
    const rows = [
      '---------',
      '--#------',
      '---------',
      '--,--+--,',
      '----0----',
      '---------',
      '--*------',
      '---------',
      '--@------',
    ];

    const board = parseBoardTextDiagram(rows.join('\n'));

    expect(board?.[1]?.[2]).toBe('black');
    expect(board?.[8]?.[2]).toBe('black');
    expect(board?.[4]?.[4]).toBe('white');
    expect(board?.[3]?.[2]).toBe(null);
    expect(board?.[6]?.[2]).toBe(null);
  });

  it('refuses everything that is not a board', () => {
    expect(parseBoardTextDiagram('')).toBe(null);
    expect(parseBoardTextDiagram('(;GM[1]FF[4]SZ[19];B[pd];W[dp])')).toBe(null);
    expect(parseBoardTextDiagram('https://online-go.com/game/12345')).toBe(null);
    expect(parseBoardTextDiagram('the quick brown fox')).toBe(null);
    // A board with no stones is a drawing, not a position; loading it would
    // replace the game on screen with nothing.
    expect(parseBoardTextDiagram(Array(9).fill('.........').join('\n'))).toBe(null);
    // Ragged rows, and a row count no board has.
    expect(parseBoardTextDiagram(['..X......', '....'].join('\n'))).toBe(null);
    expect(parseBoardTextDiagram(Array(10).fill('.........X').join('\n'))).toBe(null);
  });

  it('stops at the end of the first grid rather than merging two', () => {
    const first = ['..X......', ...Array(8).fill('.........')].join('\n');
    const board = parseBoardTextDiagram(`${first}\n\nand then some prose\n..O......`);

    expect(board?.length).toBe(9);
    expect(board?.[0]?.[2]).toBe('black');
  });
});

describe('sgfFromBoardTextDiagram', () => {
  it('writes the stones as setup, not as moves', () => {
    const rows = ['..X......', '.........', '....O....', ...Array(6).fill('.........')];

    const sgf = sgfFromBoardTextDiagram(rows.join('\n'));

    // A diagram records where the stones are and nothing about their order.
    expect(sgf).toBe('(;GM[1]FF[4]CA[UTF-8]SZ[9]AB[ca]AW[ec])');
    expect(sgf).not.toContain(';B[');
    expect(sgf).not.toContain(';W[');
  });

  it('hands back nothing when the text is not a board', () => {
    expect(sgfFromBoardTextDiagram('(;GM[1])')).toBe(null);
  });
});

describe('formatBoardNoteBlock', () => {
  const board = (): BoardState => {
    const next = createEmptyBoard(9);
    next[2]![2] = 'black';
    next[6]![6] = 'white';
    return next;
  };

  it('is a heading and a fenced diagram, which is what the note renderer draws monospace', () => {
    const blocks = parseNoteBlocks(formatBoardNoteBlock({ board: board(), moveNumber: 12 }));

    expect(blocks[0]).toEqual({ type: 'heading', level: 3, text: 'Position at move 12' });
    const code = blocks.find((block) => block.type === 'code');
    expect(code, 'the diagram must be a code block or the columns will not line up').toBeTruthy();
    // A proportional font would ruin it, so the fence is the whole point.
    expect(code && code.type === 'code' ? code.text : '').toContain('A B C D E F G H J');
  });

  it('carries a board that reads back as the one it was given', () => {
    const original = board();
    const code = parseNoteBlocks(formatBoardNoteBlock({ board: original })).find((b) => b.type === 'code');
    const text = code && code.type === 'code' ? code.text : '';

    expect(parseBoardTextDiagram(text)).toEqual(original);
  });

  it('says only Position when there is no move to number', () => {
    expect(formatBoardNoteBlock({ board: board() }).startsWith('### Position\n')).toBe(true);
    expect(formatBoardNoteBlock({ board: board(), moveNumber: 0 }).startsWith('### Position\n')).toBe(true);
  });
});
