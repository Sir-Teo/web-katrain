import type { BoardState, GameNode, Player } from '../types';

export type KifuDiagramMarker = { x: number; y: number; text: string; player: Player };

export type KifuDiagram = {
  index: number;
  startMove: number;
  endMove: number;
  board: BoardState;
  markers: KifuDiagramMarker[];
};

export type MovesPerDiagram = 10 | 25 | 50 | 100 | 'all';

/**
 * Slice an ordered list of move nodes into numbered kifu diagrams. Each diagram
 * renders the board at its last move, numbering the moves that fall in its range
 * (moves from earlier ranges show as plain stones). "all" produces one diagram at
 * the final position with every move numbered.
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
    for (let k = start; k < end; k++) {
      const move = moves[k]!.move!;
      if (move.x < 0 || move.y < 0) continue; // pass
      markers.push({ x: move.x, y: move.y, text: String(k + 1), player: move.player });
    }
    diagrams.push({
      index: diagrams.length,
      startMove: start + 1,
      endMove: end,
      board: lastNode.gameState.board,
      markers,
    });
  }

  return diagrams;
}
