import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('RightPanel layout', () => {
  it('keeps bottom content from ending flush against the viewport', () => {
    const source = readFileSync('src/components/layout/RightPanel.tsx', 'utf8');

    expect(source).toContain('flex-1 min-h-0 overflow-y-auto overscroll-contain pb-3');
  });
});
