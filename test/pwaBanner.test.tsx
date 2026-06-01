import { describe, expect, it } from 'vitest';
import { shouldReplacePwaBanner } from '../src/utils/pwa';

describe('PwaInstallBanner', () => {
  it('keeps update-ready banners ahead of generic install prompts', () => {
    expect(shouldReplacePwaBanner(null, 'install')).toBe(true);
    expect(shouldReplacePwaBanner('offline-ready', 'install')).toBe(true);
    expect(shouldReplacePwaBanner('update-ready', 'install')).toBe(false);
    expect(shouldReplacePwaBanner('update-ready', 'offline-ready')).toBe(false);
    expect(shouldReplacePwaBanner('install', 'update-ready')).toBe(true);
  });
});
