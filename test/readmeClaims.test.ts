import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The README enumerates things the code decides, and both had drifted: the AI
 * strategy list omitted `human` entirely, and the offline line still described
 * the precache as it was before it was trimmed to one WASM build and the
 * default board only.
 */
const readme = readFileSync('README.md', 'utf8');
const types = readFileSync('src/types.ts', 'utf8');
const serviceWorker = readFileSync('public/sw.js', 'utf8');

/** Every value of the `aiStrategy` union. */
const strategiesInCode = (): string[] => {
  const start = types.indexOf('  aiStrategy:');
  expect(start, 'aiStrategy union not found').toBeGreaterThan(-1);
  const body = types.slice(start, types.indexOf(';', start));
  return [...body.matchAll(/'([a-z]+)'/g)].map((m) => m[1]!).sort();
};

describe('the README describes the app that exists', () => {
  it('names every AI strategy the app offers', () => {
    const documented = new Set([...readme.matchAll(/`([a-z]+)`/g)].map((m) => m[1]!));
    const missing = strategiesInCode().filter((name) => !documented.has(name));

    expect(missing, `strategies the README never names: ${missing.join(', ')}`).toEqual([]);
  });

  it('does not promise more offline caching than the service worker does', () => {
    // One WASM build is precached, not "files"; the rest arrive at runtime.
    const precache = serviceWorker.slice(
      serviceWorker.indexOf('const PRECACHE_URLS'),
      serviceWorker.indexOf('];', serviceWorker.indexOf('const PRECACHE_URLS')),
    );
    expect(precache.match(/\.wasm'/g) ?? []).toHaveLength(1);

    // Scoped to the sentence about the service worker: elsewhere the README
    // talks about the build copying all three builds into `public/tfjs/`,
    // which is still true.
    const offline = readme.slice(readme.indexOf('The production service worker precaches'));
    // Markdown wraps the sentence across lines, so compare on one line.
    const bullet = offline.slice(0, offline.indexOf('\n\n')).replace(/\s+/g, ' ');
    expect(bullet).toContain('the one TensorFlow.js WASM build this deployment can run');
    expect(bullet).not.toMatch(/WASM files|board assets are cached/);
  });
});
