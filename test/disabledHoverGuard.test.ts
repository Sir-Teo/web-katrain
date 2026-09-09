import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const collectTsxFiles = (dir: string): string[] => {
  const files: string[] = [];

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...collectTsxFiles(path));
    else if (path.endsWith('.tsx')) files.push(path);
  }

  return files;
};

// A `hover:` that is not already inside a variant chain -- so `disabled:hover:`,
// `not-disabled:hover:`, `group-hover:` and `peer-hover:` are all left alone.
const BARE_HOVER = /(?<![\w:-])hover:/;

const sources = collectTsxFiles('src').map((path) => ({ path, source: readFileSync(path, 'utf8') }));

describe('hover styling on controls that can be disabled', () => {
  it('guards every hover utility that shares a line with a disabled utility', () => {
    // Tailwind's `hover:` fires whatever the element's disabled state, so a
    // dimmed button still lit up under the mouse -- reading as more clickable
    // disabled than at rest. `not-disabled:hover:` compiles to
    // `:not(:disabled):hover`.
    const offenders = sources.flatMap(({ path, source }) =>
      source
        .split('\n')
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => line.includes('disabled:') && BARE_HOVER.test(line))
        // pointer-events-none takes the element out of hit-testing, so no
        // hover rule of any kind can fire on it.
        .filter(({ line }) => !line.includes('disabled:pointer-events-none'))
        .map(({ index }) => `${path}:${index + 1}`),
    );

    expect(offenders).toEqual([]);
  });

  it('finds the guarded controls it is meant to be watching', () => {
    // Without this the assertion above passes on a codebase where the pairing
    // simply stopped occurring -- including one where a bad regex sees nothing.
    const guarded = sources.filter(({ source }) => source.includes('not-disabled:hover:'));

    expect(guarded.length).toBeGreaterThanOrEqual(12);
  });

  it('drops the hand-written disabled:hover: overrides it replaces', () => {
    // Four controls restored their resting value one property at a time. The
    // variant says the same thing once, and keeping both invites them to drift.
    // `not-` matters: without the lookbehind this matches the variant that
    // replaced them and never passes.
    const offenders = sources
      .filter(({ source }) => /(?<!not-)disabled:hover:/.test(source))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });
});
