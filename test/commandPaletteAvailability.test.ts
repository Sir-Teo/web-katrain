import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('command palette availability', () => {
  it('uses the same navigation capabilities as the visible board controls', () => {
    const source = readFileSync('src/components/Layout.tsx', 'utf8');

    expect(source).toContain("disabledReason: historyNavigation.back ? undefined : 'No previous move'");
    expect(source).toContain("disabledReason: historyNavigation.forward ? undefined : 'No next move'");
    expect(source).toContain("disabledReason: branchInfo.hasBranches ? undefined : 'No alternate branch'");
    expect(source).toContain("disabledReason: mistakeNavigation.previous ? undefined : 'No earlier analyzed mistake'");
    expect(source).toContain("disabledReason: mistakeNavigation.next ? undefined : 'No later analyzed mistake'");
  });

  it('offers a way to drop one pinned line without dropping the rest', () => {
    const source = readFileSync('src/components/Layout.tsx', 'utf8');
    const store = readFileSync('src/store/gameStore.ts', 'utf8');

    // The palette pinned a line, recalled it, and cleared them all -- nothing
    // in between. A fifth pin you regretted cost you the four you wanted. The
    // store has had unpinVariation(id) and a test for it the whole time, and no
    // surface called it: it was one of 85 store actions and the only one no
    // component could reach that was not reached through analyzeExtra('stop').
    expect(store).toContain('unpinVariation: (id: string) =>');
    expect(source).toContain('unpinVariation: state.unpinVariation,');
    expect(source).toContain('id: `unpin-variation-${pin.id}`');
    expect(source).toContain('label: `Unpin: ${pin.label}`');
    expect(source).toContain('unpinVariation(pin.id);');

    // Per pin, beside the recall the list already built for each one.
    expect(source).toContain('...pinnedVariations.flatMap((pin) => [');
    expect(source).toContain('id: `recall-variation-${pin.id}`');

    // And clearing them all is still there for when that is what you want.
    expect(source).toContain("id: 'clear-pinned-variations'");
  });

  it('does not offer a no-op finish scoring command outside scoring mode', () => {
    const source = readFileSync('src/components/Layout.tsx', 'utf8');

    expect(source).toContain("disabledReason: scoringMode ? undefined : 'Scoring mode is not active'");
  });
});
