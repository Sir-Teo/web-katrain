import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('board pointer gestures', () => {
  it('suppresses the click that follows a region-of-interest drag', () => {
    const source = readFileSync('src/components/GoBoard.tsx', 'utf8');

    // A drag that starts and ends on the board still produces a click, so
    // finishing a region selection also played a stone at the release point:
    // measured move count 0 -> 1, with the game left unsaved on a new branch.
    // Anchor on the commit itself and look backwards: there are two
    // `isSelectingRegionOfInterest` guards, and slicing from the first one
    // swept in a different gesture's suppression and passed either way.
    const commit = source.indexOf('setRegionOfInterest({ xMin, xMax, yMin, yMax });');
    expect(commit).toBeGreaterThan(-1);
    const guard = source.lastIndexOf('if (!roiDrag) return;', commit);
    expect(guard).toBeGreaterThan(-1);
    const block = source.slice(guard, commit);
    expect(block.length).toBeGreaterThan(60);
    expect(block).toContain('suppressNextClickRef.current = true;');
  });

  it('suppresses it for the neighbouring drag gestures too', () => {
    const source = readFileSync('src/components/GoBoard.tsx', 'utf8');
    // Whatever else changes, every drag that ends on the board must do this.
    const suppressions = source.match(/suppressNextClickRef\.current = true;/g) ?? [];
    expect(suppressions.length).toBeGreaterThanOrEqual(8);
  });
});
