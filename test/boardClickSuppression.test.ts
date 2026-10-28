import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('the board click-suppression flag', () => {
  it('is cleared by every new press, before any button check', () => {
    // A right-click or a cancelled touchend set it with no click to follow,
    // and it swallowed the next real click: a right-click mark, then a left
    // click that placed no stone.
    const source = readFileSync('src/components/GoBoard.tsx', 'utf8');
    const handler = source.slice(source.indexOf('const handlePointerDown ='));
    const reset = handler.indexOf('suppressNextClickRef.current = false;');
    const firstButtonCheck = handler.indexOf('if (e.button');
    expect(reset).toBeGreaterThanOrEqual(0);
    expect(firstButtonCheck).toBeGreaterThan(reset);
  });
});
