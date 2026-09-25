import { describe, expect, it } from 'vitest';
import { normalizeLibraryItems, parseLibraryBackup } from '../src/utils/library';

// Records as the pre-8aeb480 extractor stored them. IndexedDB's structured
// clone keeps keys whose value is undefined; a JSON backup keeps numbers.
const sgf = '( ;GM[1]SZ[19]PB[Alice]PW[Bob]AB[aa:cc];W[pd])';
const storedBeforeFix = {
  id: 'g1', name: 'Untitled', type: 'file', parentId: null, createdAt: 1, updatedAt: 1,
  sgf, moveCount: 1, size: sgf.length,
  metadata: { gameName: undefined, black: undefined, white: undefined, boardSize: undefined, setupStoneCount: undefined },
};

describe('library metadata fix reaches games already stored', () => {
  it('IndexedDB record: players read from SGF', () => {
    const [item] = normalizeLibraryItems([storedBeforeFix]);
    expect(item.type === 'file' && item.metadata.black).toBe('Alice');
  });
  it('backup from before the fix: AB[aa:cc] counts nine stones', () => {
    const backup = JSON.stringify({ version: 2, app: 'web-katrain', items: [{ ...storedBeforeFix, sgf: '(;GM[1]SZ[19]AB[aa:cc])', moveCount: 0, metadata: { boardSize: 19, setupStoneCount: 1 } }] });
    const [item] = parseLibraryBackup(backup);
    expect(item.type === 'file' && item.metadata.setupStoneCount).toBe(9);
  });
});
