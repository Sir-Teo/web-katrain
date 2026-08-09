import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { APP_REPOSITORY_URL, createVersionMetadata } from '../src/utils/versionMetadata';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('version metadata', () => {
  it('creates deployment metadata that external update checks can compare', () => {
    expect(
      createVersionMetadata({
        version: '1.2.3',
        commit: 'abcdef1',
        commitDate: '2026-06-03',
        buildDate: '2026-06-03T14:30:00.000Z',
      })
    ).toEqual({
      name: 'Web KaTrain',
      version: '1.2.3',
      gitHash: 'abcdef1',
      commitDate: '2026-06-03',
      buildDate: '2026-06-03T14:30:00.000Z',
      repository: APP_REPOSITORY_URL,
    });
  });

  it('wires version.json into both Vite builds and the dev server', () => {
    const viteConfig = fs.readFileSync(path.join(rootDir, 'vite.config.ts'), 'utf8');

    expect(viteConfig).toContain('versionMetadataPlugin()');
    expect(viteConfig).toContain("fileName: 'version.json'");
    expect(viteConfig).toContain("requestPath !== '/version.json'");
    expect(viteConfig).toContain('configureServer: serveVersionMetadata');
  });
});
