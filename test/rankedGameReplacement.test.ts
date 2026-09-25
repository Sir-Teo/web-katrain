import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('starting a ladder or gauntlet game', () => {
  it('asks about unsaved work and unlinks the library item, like any new game', () => {
    // Without either, the ladder replaced an unsaved game silently, and the
    // next Save wrote the new 9x9 over the library game still named in the title.
    const source = readFileSync('src/components/Layout.tsx', 'utf8');
    const start = source.indexOf('const replaceWithRankedGame = useCallback(');
    expect(start).toBeGreaterThan(0);
    const body = source.slice(start, start + 800);
    expect(body).toContain('if (!(await prepareForGameReplacement())) return false;');
    expect(body).toContain('setLoadedLibraryFile(null);');
    expect(body).toContain('markCurrentGameCleanAndClearAutoSave();');
    expect(source).toContain('if (!(await replaceWithRankedGame(ladder))) return;');
    expect(source).toContain('if (!(await replaceWithRankedGame(gauntlet))) return;');
  });
});
