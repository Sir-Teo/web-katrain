import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('CandidatePvTiles mobile affordances', () => {
  it('uses named strip and tile hooks with an explicit clear label', () => {
    const source = readFileSync('src/components/CandidatePvTiles.tsx', 'utf8');

    expect(source).toContain('candidate-pv-strip');
    expect(source).toContain('candidate-pv-tile');
    expect(source).toContain('aria-label="Clear continuation preview"');
  });

  it('provides touch-sized, snapping tiles with a trailing overflow fade', () => {
    const styles = readFileSync('src/index.css', 'utf8');

    expect(styles).toContain('.candidate-pv-tile {');
    expect(styles).toContain('min-height: 44px;');
    expect(styles).toContain('scroll-snap-type: x proximity;');
    expect(styles).toContain('.candidate-pv-strip.has-overflow-left.has-overflow-right');
    expect(styles).toContain('mask-image: linear-gradient(to right, transparent, #000 24px, #000 calc(100% - 24px), transparent);');
  });
});
