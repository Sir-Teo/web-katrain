import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadedModuleUrl } from '../scripts/lib/browser.mjs';

afterEach(() => vi.unstubAllGlobals());
const record = entries => vi.stubGlobal('performance', { getEntriesByType: () => entries });
describe('browser fixture module identity', () => {
  it('uses the latest loaded timestamped module without refetching its bare URL', () => {
    record([
      { name: 'http://localhost:1234/src/store/gameStore.ts', responseStatus: 200 },
      { name: 'http://localhost:1234/src/store/gameStore.ts?t=42', responseStatus: 200 },
      { name: 'http://localhost:1234/src/utils/sgf.ts?t=43', responseStatus: 200 },
    ]);
    expect(loadedModuleUrl('/src/store/gameStore.ts')).toBe('http://localhost:1234/src/store/gameStore.ts?t=42');
  });
  it('skips failed resource requests while supporting browsers without responseStatus', () => {
    record([
      { name: 'http://localhost:1234/src/store/gameStore.ts?t=42' },
      { name: 'http://localhost:1234/src/store/gameStore.ts', responseStatus: 504 },
    ]);
    expect(loadedModuleUrl('/src/store/gameStore.ts')).toBe('http://localhost:1234/src/store/gameStore.ts?t=42');
  });
  it('requires an existing singleton', () => {
    record([]);
    expect(() => loadedModuleUrl('/src/store/gameStore.ts')).toThrow('Loaded module was not recorded');
  });
  it.each(['/', '/web-katrain/', '/web-katrain/index.html?review=1#board'])(
    'resolves a first component import under the app base at %s', (pagePath) => {
      record([]);
      vi.stubGlobal('document', { baseURI: `http://localhost:1234${pagePath}` });
      const basePath = pagePath === '/' ? '/' : '/web-katrain/';
      expect(loadedModuleUrl('/src/components/StaticBoard.tsx', true))
        .toBe(`http://localhost:1234${basePath}src/components/StaticBoard.tsx`);
    },
  );
});
