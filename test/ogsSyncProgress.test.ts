import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadNewOgsGames, formatOgsSyncSummary, type OgsGameSummary } from '../src/utils/ogsSync';
import { resetOgsFetchQueueForTests } from '../src/utils/ogsQueue';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OGS sync progress', () => {
  it('moves on past a game that failed to download', async () => {
    resetOgsFetchQueueForTests();
    vi.stubGlobal('fetch', async (url: string) =>
      url.includes('/1/') || url.includes('/2/')
        ? new Response('', { status: 500 })
        : new Response('(;GM[1]SZ[19])', { status: 200 }));
    const games: OgsGameSummary[] = [1, 2, 3].map((id) => ({ id, name: '', black: 'b', white: 'w', boardSize: 19, ended: '2026-01-01' }));
    const positions: number[] = [];

    const result = await downloadNewOgsGames(games, new Set(), (progress) => {
      if (progress.current) positions.push(progress.downloaded + 1);
    });

    expect(positions).toEqual([1, 2, 3]);
    expect(result.failed).toHaveLength(2);
    expect(result.synced).toHaveLength(1);
    expect(result.notDownloaded).toBe(0);
  });
});

describe('stopping an OGS sync', () => {
  const games: OgsGameSummary[] = [1, 2, 3, 4].map((id) => ({ id, name: '', black: 'b', white: 'w', boardSize: 19, ended: '2026-01-01' }));

  it('keeps the games downloaded before the stop and counts the rest', async () => {
    resetOgsFetchQueueForTests();
    vi.stubGlobal('fetch', async () => new Response('(;GM[1]SZ[19])', { status: 200 }));
    let stopped = false;

    const result = await downloadNewOgsGames(games, new Set([4]), (progress) => {
      // The player presses Stop while the second game is downloading.
      if (progress.current?.id === 2) stopped = true;
    }, () => stopped);

    expect(result.synced.map((game) => game.summary.id)).toEqual([1]);
    expect(result.skipped).toBe(1);
    expect(result.failed).toEqual([]);
    // The download in flight is abandoned, not counted as a failure.
    expect(result.notDownloaded).toBe(2);
  });

  it('reports what was kept and what is left', () => {
    expect(formatOgsSyncSummary({ added: 2, skipped: 1, failed: 0, username: 'alice', stopped: true, notDownloaded: 1 }))
      .toBe('Sync stopped. Added 2 games to "OGS - alice". 1 already in your library. 1 not downloaded yet; sync again to fetch it.');
    expect(formatOgsSyncSummary({ added: 0, skipped: 0, failed: 0, username: 'alice', stopped: true }))
      .toBe('Sync stopped. No games were downloaded.');
  });

  it('imports what completed instead of returning early on a stop', () => {
    const source = readFileSync('src/components/OgsSyncModal.tsx', 'utf8');
    expect(source).not.toContain('if (cancelledRef.current) return;\n      if (synced.length > 0) onImport');
    expect(source).toContain('const stopped = cancelledRef.current;\n      if (synced.length > 0) onImport(player.username, synced);');
    expect(source).toContain('data-ogs-sync-stop="true"');
  });
});
