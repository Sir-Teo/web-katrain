import { describe, expect, it } from 'vitest';
import { isOverlayToggleVisible } from '../src/utils/coachTools';

const advanced = ['analysisShowChildren', 'analysisShowEval', 'analysisShowPolicy', 'analysisShowSwing'];
const primary = ['analysisShowHints', 'analysisShowOwnership'];

describe('Coach overlay toggles', () => {
  it('shows only top moves and territory until More tools is opened', () => {
    for (const key of primary) expect(isOverlayToggleVisible(key, { isPro: false, toolsOpen: false, on: false })).toBe(true);
    for (const key of advanced) expect(isOverlayToggleVisible(key, { isPro: false, toolsOpen: false, on: false })).toBe(false);
    for (const key of advanced) expect(isOverlayToggleVisible(key, { isPro: false, toolsOpen: true, on: false })).toBe(true);
  });

  it('keeps the switch for an overlay that is already on', () => {
    expect(isOverlayToggleVisible('analysisShowPolicy', { isPro: false, toolsOpen: false, on: true })).toBe(true);
  });

  it('shows every toggle in Pro', () => {
    for (const key of [...primary, ...advanced]) {
      expect(isOverlayToggleVisible(key, { isPro: true, toolsOpen: false, on: false })).toBe(true);
    }
  });
});
