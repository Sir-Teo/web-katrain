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

  it('does not offer a no-op finish scoring command outside scoring mode', () => {
    const source = readFileSync('src/components/Layout.tsx', 'utf8');

    expect(source).toContain("disabledReason: scoringMode ? undefined : 'Scoring mode is not active'");
  });
});
