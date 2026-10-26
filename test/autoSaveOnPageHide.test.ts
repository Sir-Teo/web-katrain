import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('recovery auto-save', () => {
  it('writes a pending save at once when the page is hidden or left', () => {
    const source = readFileSync('src/components/Layout.tsx', 'utf8');
    const effect = source.slice(source.indexOf('let writtenVersion:'), source.indexOf('const discardAutoSaveRecovery'));

    // The half-second debounce alone lost an edit made just before a phone
    // or installed app was put away and killed.
    expect(effect).toContain('const timeout = window.setTimeout(writeNow, 500);');
    expect(effect).toContain("window.addEventListener('pagehide', writeBeforeLeaving);");
    expect(effect).toContain("document.addEventListener('visibilitychange', writeOnHide);");
    expect(effect).toContain("window.removeEventListener('pagehide', writeBeforeLeaving);");
    expect(effect).toContain("document.removeEventListener('visibilitychange', writeOnHide);");
    // The browser fixture checks that a newer focused draft is also written
    // after the first debounce has already run for the unchanged game.
  });
});
