import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(path) ? [path] : [];
  });

const files = sources('src').map((path) => ({ path, source: readFileSync(path, 'utf8') }));

/**
 * The site is served from a github.io user domain, where localStorage is shared
 * with every other project on it, so every key this app stores carries the
 * `web-katrain:` prefix. It also carries a version, because a stored value that
 * changes meaning has nowhere else to say so.
 *
 * One key had neither: `wk-getting-started-dismissed`, which is exactly why a
 * sweep for `'web-katrain:...'` never found it.
 */
describe('stored keys', () => {
  it('are namespaced and versioned', () => {
    const suspicious: string[] = [];
    for (const { path, source } of files) {
      if (path.endsWith('storage.ts')) continue;
      for (const match of source.matchAll(/(?:localStorage|sessionStorage)\.(?:get|set|remove)Item\(\s*'([^']+)'/g)) {
        suspicious.push(`${path}: ${match[1]}`);
      }
      // Only constants that actually reach localStorage. An IndexedDB record id
      // is namespaced by the database it lives in, and a URL fragment key is
      // not storage at all.
      for (const match of source.matchAll(/const (\w*KEY)\s*=\s*'([^']+)'/g)) {
        const [, name, key] = match as unknown as [string, string, string];
        if (/^LEGACY/.test(name)) continue;
        const reachesStorage = new RegExp(
          `(?:read|write|remove)(?:Local|Session)Storage\\(\\s*${name}\\b`,
        ).test(source);
        if (!reachesStorage) continue;
        if (/^web-katrain:[\w.-]+:v\d+$/.test(key)) continue;
        suspicious.push(`${path}: ${key}`);
      }
    }

    expect(suspicious, 'these keys are not web-katrain:<name>:v<n>').toEqual([]);
  });

  it('reach storage through the guarded helpers', () => {
    // A blocked-site-data browser makes `localStorage` a throwing getter, not a
    // missing one, so every access goes through utils/storage — which is also
    // the only place that knows how to fall back.
    const raw = files
      .filter(({ path }) => !path.endsWith('storage.ts'))
      .flatMap(({ path, source }) =>
        [...source.matchAll(/(?:window\.)?(?:localStorage|sessionStorage)\.\w+\(/g)]
          .map((match) => `${path}: ${match[0]}`));

    expect(raw, 'use readLocalStorage / writeLocalStorage instead').toEqual([]);
  });

  it('is reading enough of the app to be checking anything', () => {
    const keys = files.flatMap(({ source }) => [...source.matchAll(/'(web-katrain:[^']+)'/g)].map((m) => m[1]!));

    expect(new Set(keys).size).toBeGreaterThanOrEqual(25);
  });
});
