import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('page-wide style cost', () => {
  it('keys page-level rules on <html> flags, not :has() on the root or body', () => {
    // Six such rules restyled the whole document on every DOM change: 4.9ms of
    // style recalculation per step through a game, 0.45ms without them.
    const css = read('src/index.css');
    expect(css).not.toMatch(/:root(?:\[[^\]]*\])*:has\(/);
    expect(css).not.toMatch(/\bbody:has\(/);
    expect(read('src/hooks/useDocumentFlag.ts')).toContain('root.setAttribute(attribute, value);');
  });
});

describe('re-renders per move', () => {
  it('does not replace an empty dead-stone set on every move', () => {
    // A new Set each move re-rendered the whole app a second time per step.
    expect(read('src/components/Layout.tsx')).toContain('setManualDeadStones((prev) => (prev.size === 0 ? prev : new Set()));');
  });

  it('keeps the clock display when a tick changes nothing', () => {
    // 142 commits in 10 idle seconds, from a 70ms tick.
    const timer = read('src/components/Timer.tsx');
    expect(timer).toMatch(/setDisplay\(\(prev\) =>[\s\S]*?\? prev\s*: next/);
  });
});

describe('library writes', () => {
  it('skips rewriting the store when an update changed nothing', () => {
    // Opening the Library cleared and re-put every record: 2.6s to rows at 3,000 games.
    const library = read('src/utils/library.ts');
    expect(library).toContain('const unchanged = mutation.items === loaded && !!getIndexedDB() && !idbLoadFailed;');
    expect(library).toContain('await saveToIndexedDb(normalized, true);');
  });
});
