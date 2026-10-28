import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('recovery auto-save', () => {
  it('writes a pending save at once when the page is hidden or left', () => {
    const source = readFileSync('src/components/Layout.tsx', 'utf8');
    const effect = source.slice(source.indexOf('let writtenTreeVersion:'), source.indexOf('const discardAutoSaveRecovery'));

    // The half-second debounce alone lost an edit made just before a phone
    // or installed app was put away and killed.
    expect(effect).toContain('const timeout = window.setTimeout(writeNow, 500);');
    expect(effect).toContain("window.addEventListener('pagehide', writeNow);");
    expect(effect).toContain("document.addEventListener('visibilitychange', writeOnHide);");
    expect(effect).toContain("window.removeEventListener('pagehide', writeNow);");
    expect(effect).toContain("document.removeEventListener('visibilitychange', writeOnHide);");
    // Repeated lifecycle events write once per revision, including a pending
    // note committed in the capture phase after the debounce already ran.
    expect(effect).toContain('const currentTreeVersion = useGameStore.getState().treeVersion;');
    expect(effect).toMatch(/if \(writtenTreeVersion === currentTreeVersion\) return;\s*writtenTreeVersion = currentTreeVersion;/);
  });
});
