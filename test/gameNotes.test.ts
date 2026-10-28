import { describe, expect, it } from 'vitest';
import type { GameNode, GameState } from '../src/types';
import { collectGameNotes, filterGameNotes, gameNoteSnippet } from '../src/utils/gameNotes';

const state: GameState = { board: Array.from({ length: 9 }, () => Array(9).fill(null)), currentPlayer: 'black', moveHistory: [], capturedBlack: 0, capturedWhite: 0, komi: 6.5 };
const node = (id: string, parent: GameNode | null = null, extra: Partial<GameNode> = {}): GameNode => {
  const result: GameNode = { id, parent, children: [], move: null, gameState: state, ...extra };
  parent?.children.push(result);
  return result;
};

describe('game notes search', () => {
  it('includes root notes, named positions, and collapsed variations in tree order', () => {
    const root = node('root', null, { note: 'Study overview' });
    node('main', root, { move: { x: 3, y: 5, player: 'black' }, note: 'Keep the corner' });
    const variation = node('variation', root, { move: { x: -1, y: -1, player: 'black' }, collapsed: true, properties: { N: ['Alternative'] } });
    node('reply', variation, { move: { x: 5, y: 3, player: 'white' }, note: 'Punish the pass' });
    expect(collectGameNotes(root).map(({ node, label, title, isVariation }) => ({ id: node.id, label, title, isVariation }))).toEqual([
      { id: 'root', label: 'Start', title: '', isVariation: false },
      { id: 'main', label: 'Move 1 · Black D4', title: '', isVariation: false },
      { id: 'variation', label: 'Move 1 · Black Pass', title: 'Alternative', isVariation: true },
      { id: 'reply', label: 'Move 2 · White F6', title: '', isVariation: true },
    ]);
  });

  it('uses full notes and matches terms across the title, coordinate, and comment', () => {
    const root = node('root', null, { note: 'Opening overview' });
    node('move', root, { move: { x: 3, y: 5, player: 'black' }, properties: { N: ['Corner lesson'] }, note: 'First line\nA useful tesuji appears much later' });
    const entries = collectGameNotes(root);
    expect(filterGameNotes(entries, 'TESUJI d4 corner').map(e => e.node.id)).toEqual(['move']);
    expect(filterGameNotes(entries, 'tesuji overview')).toEqual([]);
    expect(filterGameNotes(entries, '   ')).toBe(entries);
  });

  it('keeps move numbering through comment-only and setup nodes', () => {
    const root = node('root');
    const first = node('first', root, { move: { x: 0, y: 0, player: 'black' } });
    const comment = node('comment', first, { note: 'Read this' });
    const setup = node('setup', comment, { properties: { AB: ['bb'] }, note: 'Setup' });
    node('next', setup, { move: { x: 1, y: 2, player: 'white' }, note: 'Reply' });
    expect(collectGameNotes(root).map(e => e.label)).toEqual(['Position 1', 'Position 2', 'Move 3 · White B7']);
  });

  it('ignores empty annotations and never mutates the game', () => {
    const root = node('root', null, { note: '  ', properties: { N: [' '] } });
    const child = node('child', root, { note: 'A note', collapsed: true });
    const before = { note: child.note, collapsed: child.collapsed, parent: child.parent };
    expect(collectGameNotes(root)).toHaveLength(1);
    expect({ note: child.note, collapsed: child.collapsed, parent: child.parent }).toEqual(before);
  });

  it('handles a 12,000-node study without recursion or repeated ancestor walks', () => {
    const root = node('root');
    let current = root;
    for (let i = 0; i < 12000; i++) current = node(`note-${i}`, current, { note: `Comment ${i}` });
    const entries = collectGameNotes(root);
    expect(entries).toHaveLength(12000);
    expect(entries.at(-1)?.node).toBe(current);
    expect(filterGameNotes(entries, 'Comment 11999').map(e => e.node.id)).toEqual(['note-11999']);
  });

  it('shows a passage around a match beyond the first line', () => {
    const note = `${'Opening thought. '.repeat(25)}\nThe key tesuji wins. ${'Continuation. '.repeat(25)}`;
    const snippet = gameNoteSnippet(note, 'tesuji');
    expect(snippet).toContain('key tesuji wins');
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet.length).toBeLessThanOrEqual(162);
    expect(gameNoteSnippet('  One\n two   ', '')).toBe('One two');
  });
});
