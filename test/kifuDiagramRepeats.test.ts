import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildKifuDiagrams } from '../src/utils/kifuDiagrams';
import type { GameNode, Player } from '../src/types';

/** Just enough of a node for the builder, which reads `move` and the board. */
const node = (x: number, y: number, player: Player): GameNode =>
  ({ move: { x, y, player }, gameState: { board: [] } } as unknown as GameNode);

const play = (points: Array<[number, number]>): GameNode[] =>
  points.map(([x, y], i) => node(x, y, i % 2 === 0 ? 'black' : 'white'));

describe('a point played twice in one diagram', () => {
  it('keeps the first number and notes the second underneath', () => {
    // A stone captured and the point taken again, which happens in any game
    // with a fight in it. Drawing both put two numbers on one intersection:
    // measured on a 296-move game at 100 to a diagram, 102 pairs of labels
    // overlapped, the worst by 35.7px of a 37px cell.
    const [diagram] = buildKifuDiagrams(play([[3, 3], [4, 4], [3, 3]]), 'all');

    expect(diagram!.markers.map((m) => m.text)).toEqual(['1', '2']);
    expect(diagram!.repeats).toEqual([{ move: 3, at: 1 }]);
  });

  it('records every later move on the point, against the first', () => {
    const [diagram] = buildKifuDiagrams(play([[3, 3], [4, 4], [3, 3], [3, 3]]), 'all');

    expect(diagram!.markers).toHaveLength(2);
    expect(diagram!.repeats).toEqual([{ move: 3, at: 1 }, { move: 4, at: 1 }]);
  });

  it('says nothing when every point is played once', () => {
    const [diagram] = buildKifuDiagrams(play([[3, 3], [4, 4], [5, 5]]), 'all');

    expect(diagram!.markers).toHaveLength(3);
    expect(diagram!.repeats).toEqual([]);
  });

  it('starts fresh in each diagram, because each numbers only its own range', () => {
    // The same point in two chunks is two numbers on two boards, not a repeat:
    // move 1 and move 11 are both at 3,3, either side of a ten-move split.
    const points: Array<[number, number]> = [[3, 3]];
    for (let i = 1; i < 10; i += 1) points.push([i, 9]);
    points.push([3, 3]);
    const diagrams = buildKifuDiagrams(play(points), 10);

    expect(diagrams).toHaveLength(2);
    expect(diagrams[0]!.repeats).toEqual([]);
    expect(diagrams[1]!.repeats).toEqual([]);
    expect(diagrams[1]!.markers.map((m) => m.text)).toEqual(['11']);
  });

  it('does not treat two passes as the same point', () => {
    // A pass is x/y of -1 and is skipped before any of this.
    const [diagram] = buildKifuDiagrams(play([[-1, -1], [3, 3], [-1, -1]]), 'all');

    expect(diagram!.markers.map((m) => m.text)).toEqual(['2']);
    expect(diagram!.repeats).toEqual([]);
  });
});

describe('the diagram carries its note to the page', () => {
  const modal = readFileSync('src/components/KifuPrintModal.tsx', 'utf8');

  it('prints them under the board, as a kifu does', () => {
    expect(modal).toContain('{diagram.repeats.length > 0 && (');
    expect(modal).toContain("`${repeat.move} at ${repeat.at}`");
    expect(modal).toContain('className="kifu-diagram-repeats');
  });

  it('gives the note the same ink as the caption when printed', () => {
    // Without this it prints in a muted theme colour meant for a screen.
    expect(modal).toContain('.kifu-print .kifu-diagram-repeats { color: #334155 !important; }');
  });
});
