import { describe, expect, it } from 'vitest';
import {
  DESKTOP_LAYOUT_MEDIA,
  isDesktopLayoutSize,
  isMobileLayoutSize,
  MOBILE_LAYOUT_MEDIA,
} from '../src/utils/responsiveLayout';

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
});
