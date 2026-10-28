import { afterEach, describe, expect, it, vi } from 'vitest';
import { auditTextContrast } from '../scripts/lib/text-contrast.mjs';

afterEach(() => vi.unstubAllGlobals());

function page(leafStyle, groupStyle = {}, { disabled = false, disabledLabel = false } = {}) {
  const root = { parentElement: null };
  const group = { parentElement: root };
  const leaf = {
    children: [], textContent: 'Sample text', className: 'sample', parentElement: group,
    getBoundingClientRect: () => ({ width: 80, height: 24 }),
    closest: selector => {
      if (selector === ':disabled,[aria-disabled="true"]' && disabled) return leaf;
      if (selector === 'label' && disabledLabel) return { control: { matches: () => true } };
      return null;
    },
  };
  const defaults = { display: 'block', visibility: 'visible', opacity: '1', color: 'rgb(0,0,0)', backgroundColor: 'rgba(0,0,0,0)', fontSize: '12px', fontWeight: '400' };
  const styles = new Map([[root, { backgroundColor: 'rgb(255,255,255)' }], [group, groupStyle], [leaf, leafStyle]]);
  vi.stubGlobal('document', { querySelectorAll: () => [leaf] });
  vi.stubGlobal('getComputedStyle', el => ({ ...defaults, ...styles.get(el) }));
}

describe('rendered text contrast', () => {
  it('passes opaque black on white and white on black', () => {
    page({ color: 'rgb(0,0,0)' });
    expect(auditTextContrast()).toEqual([]);
    page({ color: 'color(srgb 1 1 1)' }, { backgroundColor: 'rgb(0,0,0)' });
    expect(auditTextContrast()).toEqual([]);
  });

  it('measures a half-opacity black label as gray on white, approximately 3.98:1', () => {
    page({ color: 'rgb(0,0,0)', opacity: '0.5' });
    expect(auditTextContrast()).toEqual(['Sample text 3.98:1 (needs 4.5:1)']);
  });

  it('composites group opacity with the surface as well as its text', () => {
    page({ color: 'rgb(255,255,255)' }, { backgroundColor: 'rgb(0,0,0)', opacity: '0.5' });
    expect(auditTextContrast()).toEqual(['Sample text 3.98:1 (needs 4.5:1)']);
  });

  it('handles transparent text without confusing it with group opacity', () => {
    page({ color: 'rgba(255,255,255,0.5)' }, { backgroundColor: 'rgb(0,0,0)' });
    expect(auditTextContrast()).toEqual([]); // Gray on black is approximately 5.28:1.
  });

  it('applies the lower contrast threshold to large text', () => {
    page({ color: 'rgb(0,0,0)', opacity: '0.5', fontSize: '24px' });
    expect(auditTextContrast()).toEqual([]);
  });

  it('exempts disabled controls and fully invisible text', () => {
    page({ color: 'rgb(230,230,230)' }, {}, { disabled: true });
    expect(auditTextContrast()).toEqual([]);
    page({ opacity: '0' });
    expect(auditTextContrast()).toEqual([]);
  });

  it('exempts associated disabled labels while retaining checks for explanatory copy', () => {
    page({ color: 'rgb(230,230,230)' }, {}, { disabledLabel: true });
    expect(auditTextContrast()).toEqual([]);
    page({ color: 'rgb(230,230,230)' });
    expect(auditTextContrast()).toHaveLength(1);
  });
});
