import type { GameNode } from '../types';
import { formatBoardMoveLabel } from '../lib/gtp';
import { isGameNodeStep } from './branchNavigation';
import { toSearchTerms } from './searchTerms';

export type GameNoteEntry = {
  node: GameNode;
  label: string;
  title: string;
  note: string;
  isVariation: boolean;
  searchText: string;
};

/** Visit annotated positions in tree order, including collapsed variations. */
export function collectGameNotes(root: GameNode): GameNoteEntry[] {
  const entries: GameNoteEntry[] = [];
  const stack = [{ node: root, moveNumber: 0, isVariation: false }];
  while (stack.length) {
    const { node, moveNumber, isVariation } = stack.pop()!;
    const note = node.note?.trim() ?? '';
    const title = node.properties?.N?.[0]?.trim() ?? '';
    if (note || title) {
      const label = node.move
        ? `Move ${moveNumber} · ${node.move.player === 'black' ? 'Black' : 'White'} ${formatBoardMoveLabel(node.move, node.gameState.board.length)}`
        : node.parent ? `Position ${moveNumber}` : 'Start';
      entries.push({ node, label, title, note, isVariation, searchText: `${label} ${title} ${note}`.toLowerCase() });
    }
    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i];
      stack.push({ node: child, moveNumber: moveNumber + Number(isGameNodeStep(child)), isVariation: isVariation || i > 0 });
    }
  }
  return entries;
}

export function filterGameNotes(entries: GameNoteEntry[], query: string): GameNoteEntry[] {
  const terms = toSearchTerms(query);
  return terms.length ? entries.filter(entry => terms.every(term => entry.searchText.includes(term))) : entries;
}

/** Show the matching passage even when it is far below the note's first line. */
export function gameNoteSnippet(note: string, query: string, length = 160): string {
  const text = note.replace(/\s+/g, ' ').trim();
  if (text.length <= length) return text;
  const lower = text.toLowerCase();
  const matches = toSearchTerms(query).map(term => lower.indexOf(term)).filter(index => index >= 0);
  const start = matches.length ? Math.max(0, Math.min(...matches) - 40) : 0;
  const end = Math.min(text.length, start + length);
  return `${start ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}
