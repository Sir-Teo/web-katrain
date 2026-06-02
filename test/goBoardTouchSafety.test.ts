import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('GoBoard touch safety', () => {
  it('cancels multi-touch gestures before they can become board clicks', () => {
    const source = readFileSync('src/components/GoBoard.tsx', 'utf8');

    expect(source).toContain('const cancelTouchGesture = useCallback');
    expect(source).toContain('if (suppressClick) suppressNextClickRef.current = true;');
    expect(source).toContain('if (e.touches.length !== 1) {');
    expect(source).toContain('cancelTouchGesture(true);');
    expect(source).toContain('const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {');
    expect(source).toContain('if (e.touches.length > 0) {');
    expect(source).toContain('onTouchMove={handleTouchMove}');
  });
});
