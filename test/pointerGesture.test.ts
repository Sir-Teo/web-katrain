import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gestureForPointer } from '../src/utils/pointerGesture';

describe('gestureForPointer', () => {
  it('returns the gesture whose pointer matches', () => {
    const stroke = { pointerId: 7, kind: 'line' };

    expect(gestureForPointer(stroke, 7)).toBe(stroke);
    expect(gestureForPointer(stroke, 8)).toBeNull();
  });

  // `ref.current?.pointerId === e.pointerId` compares undefined to undefined
  // when nothing is in flight and the event carries no pointerId — the guard
  // passed and the branch dereferenced null, so a stray `pointerup` on the
  // board threw the whole canvas into the error boundary.
  it('does not treat a missing pointer id as a match for no gesture', () => {
    expect(gestureForPointer(null, undefined as unknown as number)).toBeNull();
    expect(gestureForPointer(undefined, undefined as unknown as number)).toBeNull();
  });

  it('is the only guard the board uses for in-flight pointer gestures', () => {
    const source = readFileSync('src/components/GoBoard.tsx', 'utf8');

    expect(source).not.toContain('?.pointerId === e.pointerId');
    expect(source).toContain("import { gestureForPointer } from '../utils/pointerGesture'");
  });
});
