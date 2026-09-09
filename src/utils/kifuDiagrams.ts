import type { BoardState, GameNode, Player } from '../types';

export type KifuDiagramMarker = { x: number; y: number; text: string; player: Player };

/** A move played where an earlier move in the same diagram already sits. */
export type KifuDiagramRepeat = { move: number; at: number };

export type KifuDiagram = {
  index: number;
  startMove: number;
  endMove: number;
  board: BoardState;
  markers: KifuDiagramMarker[];
  /** Moves whose number could not be drawn, and the number it would sit on. */
  repeats: KifuDiagramRepeat[];
};

export type MovesPerDiagram = 10 | 25 | 50 | 100 | 'all';

/**
 * Slice an ordered list of move nodes into numbered kifu diagrams. Each diagram
 * renders the board at its last move, numbering the moves that fall in its range
 * (moves from earlier ranges show as plain stones). "all" produces one diagram at
 * the final position with every move numbered.
 *
 * A point played twice in one diagram -- a stone captured and the point taken
 * again, which happens in any game with a fight in it -- gets one number, and
 * the later move is listed as a repeat for the caption to carry. Drawing both
 * put two numbers on the same intersection: measured on a 296-move game at 100
 * moves to a diagram, 102 pairs of labels overlapped, the worst by 35.7px of a
 * 37px cell, which is one number written over another. It is also what a
 * printed kifu has always done -- "190 at 149" under the board.
 */
export function buildKifuDiagrams(moveNodes: GameNode[], movesPerDiagram: MovesPerDiagram): KifuDiagram[] {
  const moves = moveNodes.filter((node) => node.move != null);
  if (moves.length === 0) return [];
  const chunkSize = movesPerDiagram === 'all' ? moves.length : movesPerDiagram;
  const diagrams: KifuDiagram[] = [];

  for (let start = 0; start < moves.length; start += chunkSize) {
    const end = Math.min(moves.length, start + chunkSize);
    const chunk = moves.slice(start, end);
    const lastNode = chunk[chunk.length - 1]!;
    const markers: KifuDiagramMarker[] = [];
    const repeats: KifuDiagramRepeat[] = [];
    const numberAt = new Map<string, number>();
    for (let k = start; k < end; k++) {
      const move = moves[k]!.move!;
      if (move.x < 0 || move.y < 0) continue; // pass
      const moveNumber = k + 1;
      const point = `${move.x},${move.y}`;
      const already = numberAt.get(point);
      if (already !== undefined) {
        repeats.push({ move: moveNumber, at: already });
        continue;
      }
      numberAt.set(point, moveNumber);
      markers.push({ x: move.x, y: move.y, text: String(moveNumber), player: move.player });
    }
    diagrams.push({
      index: diagrams.length,
      startMove: start + 1,
      endMove: end,
      board: lastNode.gameState.board,
      markers,
      repeats,
    });
  }

  return diagrams;
}
