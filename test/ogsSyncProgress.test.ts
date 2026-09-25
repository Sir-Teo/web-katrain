import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadNewOgsGames, type OgsGameSummary } from '../src/utils/ogsSync';
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
  });
});
