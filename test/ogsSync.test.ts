import { describe, expect, it } from 'vitest';
import {
  collectExistingOgsGameIds,
  ogsSyncFileName,
  ogsSyncFolderName,
  parseOgsGameList,
  parseOgsPlayerSearch,
} from '../src/utils/ogsSync';
import { createLibraryFolder, createLibraryItem } from '../src/utils/library';

const game = (overrides: Record<string, unknown> = {}) => ({
  id: 12345,
  name: 'Friendly Match',
  width: 19,
  height: 19,
  ended: '2026-06-30T12:00:00Z',
  annulled: false,
  players: {
    black: { username: 'alice' },
    white: { username: 'bob' },
  },
  ...overrides,
});

describe('parseOgsPlayerSearch', () => {
  it('finds the case-insensitive exact username match', () => {
    const payload = {
      results: [
        { id: 1, username: 'Alicorn' },
        { id: 2, username: 'Alice' },
      ],
    };
    expect(parseOgsPlayerSearch(payload, 'alice')).toEqual({ id: 2, username: 'Alice' });
  });

  it('returns null when no exact match exists', () => {
    const payload = { results: [{ id: 1, username: 'Alicorn' }] };
    expect(parseOgsPlayerSearch(payload, 'alice')).toBeNull();
    expect(parseOgsPlayerSearch(null, 'alice')).toBeNull();
  });
});

describe('parseOgsGameList', () => {
  it('keeps finished, square, supported-size games', () => {
    const payload = { results: [game()] };
    expect(parseOgsGameList(payload)).toEqual([
      {
        id: 12345,
        name: 'Friendly Match',
        black: 'alice',
        white: 'bob',
        boardSize: 19,
        ended: '2026-06-30T12:00:00Z',
      },
    ]);
  });

  it('skips live, annulled, non-square, and unsupported-size games', () => {
    const payload = {
      results: [
        game({ id: 1, ended: null }), // still in progress
        game({ id: 2, annulled: true }),
        game({ id: 3, width: 19, height: 13 }),
        game({ id: 4, width: 7, height: 7 }),
        game({ id: 5 }),
      ],
    };
    expect(parseOgsGameList(payload).map((entry) => entry.id)).toEqual([5]);
  });

  it('tolerates malformed payloads', () => {
    expect(parseOgsGameList(null)).toEqual([]);
    expect(parseOgsGameList({ results: [null, 42, {}] })).toEqual([]);
  });
});

describe('sync naming and dedup', () => {
  it('builds folder and file names carrying the OGS id marker', () => {
    expect(ogsSyncFolderName('Alice')).toBe('OGS - Alice');
    const name = ogsSyncFileName({
      id: 987,
      name: '',
      black: 'alice',
      white: 'bob',
      boardSize: 19,
      ended: '2026-06-30T12:00:00Z',
    });
    expect(name).toBe('alice vs bob 2026-06-30 (ogs-987)');
  });

  it('collects already-synced game ids from library file names', () => {
    const folder = createLibraryFolder('OGS - Alice', null);
    const items = [
      folder,
      createLibraryItem('alice vs bob 2026-06-30 (ogs-987)', '(;GM[1]FF[4]SZ[19])', folder.id),
      createLibraryItem('casual game', '(;GM[1]FF[4]SZ[19])', null),
    ];
    expect(collectExistingOgsGameIds(items)).toEqual(new Set([987]));
  });
});
