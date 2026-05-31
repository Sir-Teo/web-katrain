import { describe, expect, it } from 'vitest';
import {
  getPwaInstallDismissed,
  getServiceWorkerUrl,
  PWA_INSTALL_DISMISSED_KEY,
  setPwaInstallDismissed,
} from '../src/utils/pwa';

function makeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

describe('PWA helpers', () => {
  it('builds a base-aware service worker URL', () => {
    expect(getServiceWorkerUrl('/')).toBe('/sw.js');
    expect(getServiceWorkerUrl('/web-katrain/')).toBe('/web-katrain/sw.js');
    expect(getServiceWorkerUrl('/web-katrain')).toBe('/web-katrain/sw.js');
  });

  it('persists whether the install prompt was dismissed', () => {
    const storage = makeStorage();

    expect(getPwaInstallDismissed(storage)).toBe(false);

    setPwaInstallDismissed(true, storage);
    expect(storage.getItem(PWA_INSTALL_DISMISSED_KEY)).toBe('true');
    expect(getPwaInstallDismissed(storage)).toBe(true);

    setPwaInstallDismissed(false, storage);
    expect(storage.getItem(PWA_INSTALL_DISMISSED_KEY)).toBeNull();
    expect(getPwaInstallDismissed(storage)).toBe(false);
  });
});
