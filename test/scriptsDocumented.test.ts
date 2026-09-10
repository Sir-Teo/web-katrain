import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The Scripts table in docs/development.md presents itself as the whole list,
 * so a script missing from it is a tool nobody knows exists.
 *
 * `npm run test:responsiveness` was exactly that: a real-browser check on how
 * fast the app answers a click, guarding two regressions that had already
 * happened, documented in neither the table nor the README while its sibling
 * `test:viewport` was in both.
 */
const scripts = (JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }).scripts;

// npm runs these itself; there is nothing for a reader to do with them.
const LIFECYCLE = new Set(['predev', 'prebuild']);

const documented = Object.keys(scripts).filter((name) => !LIFECYCLE.has(name));

describe('every npm script is documented', () => {
  it('appears in the development guide Scripts table', () => {
    const table = readFileSync('docs/development.md', 'utf8');
    const missing = documented.filter((name) => !table.includes(`\`npm run ${name}\``) && !table.includes(`\`npm ${name}\``));

    expect(missing, `undocumented in docs/development.md: ${missing.join(', ')}`).toEqual([]);
  });

  it('lists nothing the package no longer has', () => {
    const table = readFileSync('docs/development.md', 'utf8');
    const cited = [...table.matchAll(/`npm (?:run )?([a-z][\w:-]*)`/g)].map((m) => m[1]!);
    const unknown = [...new Set(cited)].filter((name) => !(name in scripts));

    expect(unknown, `docs/development.md names scripts that do not exist: ${unknown.join(', ')}`).toEqual([]);
  });

  it('keeps the README naming scripts that exist', () => {
    const readme = readFileSync('README.md', 'utf8');
    const cited = [...readme.matchAll(/`npm (?:run )?([a-z][\w:-]*)`/g)].map((m) => m[1]!);
    const unknown = [...new Set(cited)].filter((name) => !(name in scripts));

    expect(unknown, `README.md names scripts that do not exist: ${unknown.join(', ')}`).toEqual([]);
  });
});
