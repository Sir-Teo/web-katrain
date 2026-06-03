import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const collectTsxFiles = (dir: string): string[] => {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      files.push(...collectTsxFiles(path));
    } else if (path.endsWith('.tsx')) {
      files.push(path);
    }
  }

  return files;
};

describe('external link hardening', () => {
  it('keeps target blank anchors isolated from the opener window', () => {
    const offenders = collectTsxFiles('src/components').flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      return (source.match(/<a\b[^>]*target="_blank"[^>]*>/gs) ?? [])
        .filter((tag) => {
          const rel = tag.match(/\brel="([^"]+)"/)?.[1] ?? '';
          const tokens = new Set(rel.split(/\s+/).filter(Boolean));
          return !tokens.has('noopener') || !tokens.has('noreferrer');
        })
        .map((tag) => ({ path, tag }));
    });

    expect(offenders).toEqual([]);
  });
});
