import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicUrl } from '../src/utils/publicUrl';

/**
 * Every asset the app fetches goes through here: the KataGo model, the TFJS
 * wasm files, the board images. It is four lines and it had no test, which
 * matters because the failure mode is deployment-only — the base is `/` in dev
 * and `/web-katrain/` on GitHub Pages, so a joining bug is invisible until it
 * is live and every asset 404s.
 */
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('building a URL under the deployed base', () => {
  it('joins a plain path to the base', () => {
    vi.stubEnv('BASE_URL', '/web-katrain/');
    expect(publicUrl('models/katago-small.bin.gz')).toBe('/web-katrain/models/katago-small.bin.gz');
  });

  it('does not double the slash when the path has a leading one', () => {
    vi.stubEnv('BASE_URL', '/web-katrain/');
    expect(publicUrl('/models/katago-small.bin.gz')).toBe('/web-katrain/models/katago-small.bin.gz');
  });

  it('adds the separator when the base lacks a trailing slash', () => {
    vi.stubEnv('BASE_URL', '/web-katrain');
    expect(publicUrl('tfjs/tfjs-backend-wasm.wasm')).toBe('/web-katrain/tfjs/tfjs-backend-wasm.wasm');
  });

  it('handles a base and a path that both bring a slash', () => {
    vi.stubEnv('BASE_URL', '/web-katrain');
    expect(publicUrl('/tfjs/tfjs-backend-wasm.wasm')).toBe('/web-katrain/tfjs/tfjs-backend-wasm.wasm');
  });

  it('works at the root, which is what dev serves', () => {
    vi.stubEnv('BASE_URL', '/');
    expect(publicUrl('katrain/board.png')).toBe('/katrain/board.png');
    expect(publicUrl('/katrain/board.png')).toBe('/katrain/board.png');
  });

  it('returns the base itself for an empty path', () => {
    vi.stubEnv('BASE_URL', '/web-katrain/');
    expect(publicUrl('')).toBe('/web-katrain/');
  });
});
