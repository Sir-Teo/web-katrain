import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('opening a share link or launched file at startup', () => {
  it('keeps last session’s unsaved game before the load replaces it', () => {
    // Skipping the recovery prompt used to drop the snapshot too: a share
    // link overwrote it, shared text and launched files cleared it.
    const source = readFileSync('src/components/Layout.tsx', 'utf8');
    const start = source.indexOf('const suppressRecoveryPrompt = () => {');
    const body = source.slice(start, start + 1200);
    expect(body).toContain('const snapshot = readAutoSavedGame();');
    expect(body).toContain("getUniqueLibraryItemName('Recovered unsaved game', items, null)");
    // Read before the shared game is loaded over it.
    expect(source.indexOf('suppressRecoveryPrompt();\n        loadGame(parsed);')).toBeGreaterThan(0);
  });
});
