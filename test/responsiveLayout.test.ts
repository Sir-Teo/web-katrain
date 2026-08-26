import { afterEach, describe, expect, it } from 'vitest';
import {
  DESKTOP_LAYOUT_MEDIA,
  isDesktopLayoutSize,
  isDesktopLayoutViewport,
  isMobileLayoutSize,
  isMobileLayoutViewport,
  MOBILE_LAYOUT_MEDIA,
  shouldShowMobileMatchStrip,
} from '../src/utils/responsiveLayout';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

function restoreWindow() {
  if (originalWindow) {
    Object.defineProperty(globalThis, 'window', originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, 'window');
  }
}

afterEach(() => {
  restoreWindow();
});

describe('responsive layout thresholds', () => {
  it('keeps normal desktop and tablet-landscape sizes in desktop layout', () => {
    expect(isDesktopLayoutSize(1280, 800)).toBe(true);
    expect(isDesktopLayoutSize(1024, 768)).toBe(true);
  });

  it('uses the mobile layout for narrow or short landscape viewports', () => {
    expect(isMobileLayoutSize(390, 844)).toBe(true);
    expect(isMobileLayoutSize(844, 390)).toBe(true);
    expect(isMobileLayoutSize(1024, 390)).toBe(true);
  });

  it('exports media queries that match the size helper boundary', () => {
    expect(DESKTOP_LAYOUT_MEDIA).toBe('(min-width: 1024px) and (min-height: 500px)');
    expect(MOBILE_LAYOUT_MEDIA).toBe('(max-width: 1023px), (max-height: 499px)');
  });

  it('falls back to viewport dimensions when matchMedia is unavailable', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { innerWidth: 844, innerHeight: 390 },
    });

    expect(isDesktopLayoutViewport()).toBe(false);
    expect(isMobileLayoutViewport()).toBe(true);
  });

  it('falls back to viewport dimensions when matchMedia throws', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        innerWidth: 1280,
        innerHeight: 800,
        matchMedia: () => {
          throw new Error('matchMedia blocked');
        },
      },
    });

    expect(isDesktopLayoutViewport()).toBe(true);
    expect(isMobileLayoutViewport()).toBe(false);
  });
});

describe('mobile match strip gate', () => {
  it('fills the spare band on phone portrait viewports', () => {
    expect(shouldShowMobileMatchStrip(390, 844)).toBe(true);
    expect(shouldShowMobileMatchStrip(360, 800)).toBe(true);
    expect(shouldShowMobileMatchStrip(430, 932)).toBe(true);
    expect(shouldShowMobileMatchStrip(375, 667)).toBe(true);
  });

  it('stays off where the board would have to give up height for it', () => {
    // Tablet portrait: the board is already height-limited.
    expect(shouldShowMobileMatchStrip(768, 1024)).toBe(false);
    // Short phone portrait: only ~84px of spare band in total.
    expect(shouldShowMobileMatchStrip(320, 568)).toBe(false);
    // Landscape phones centre a height-limited board with side margins.
    expect(shouldShowMobileMatchStrip(844, 390)).toBe(false);
  });

  it('never shows on the desktop shell', () => {
    expect(shouldShowMobileMatchStrip(1024, 1400)).toBe(false);
    expect(shouldShowMobileMatchStrip(1280, 800)).toBe(false);
  });
});
