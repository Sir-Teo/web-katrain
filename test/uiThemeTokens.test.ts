import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.(css|ts|tsx)$/.test(entry)) out.push(path);
  }
  return out;
}

const css = readFileSync('src/index.css', 'utf8');
const defined = new Set([...css.matchAll(/(--ui-[A-Za-z0-9_-]+)\s*:/g)].map((m) => m[1]));

const referenced = new Map<string, string[]>();
for (const file of sourceFiles('src')) {
  for (const match of readFileSync(file, 'utf8').matchAll(/var\(\s*(--ui-[A-Za-z0-9_-]+)/g)) {
    referenced.set(match[1], [...(referenced.get(match[1]) ?? []), file]);
  }
}

describe('ui theme tokens', () => {
  it('never names a token the themes do not define', () => {
    // `var(--typo, #fallback)` is valid CSS: the fallback renders and nothing
    // reports a problem, so the colour silently stops following the theme.
    // That is how two dialogs kept a fixed amber through all four themes, at
    // 2.28:1 on the light one — below the 4.5:1 the themed colour was picked
    // to clear.
    const undefinedTokens = [...referenced]
      .filter(([token]) => !defined.has(token))
      .map(([token, files]) => `${token} (${files.join(', ')})`);

    expect(undefinedTokens).toEqual([]);
  });

  it('checks something — both sides of the comparison are populated', () => {
    expect(defined.size).toBeGreaterThan(20);
    expect(referenced.size).toBeGreaterThan(20);
    // Every theme has to carry the whole palette, or switching theme leaves
    // some colours resolving against whatever the previous theme set.
    for (const theme of ['noir', 'kaya', 'studio', 'light']) {
      expect(css).toContain(`:root[data-ui-theme='${theme}']`);
    }
  });
});
