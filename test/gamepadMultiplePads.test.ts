import { beforeEach, describe, expect, it, vi } from 'vitest';

// Minimal hook runtime: effects run immediately, refs/state are plain.
vi.mock('react', () => ({
  useRef: (v: unknown) => ({ current: v }),
  useState: (v: unknown) => [v, () => {}],
  useEffect: (fn: () => void) => { fn(); },
}));

type Pad = { id: string; index: number; connected: boolean; timestamp: number; mapping: string; axes: number[]; buttons: { pressed: boolean; value: number }[] };
const mkPad = (id: string, index: number): Pad => ({
  id, index, connected: true, timestamp: 0, mapping: 'standard', axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
});

let now = 0;
let rafCb: ((t: number) => void) | null = null;
let pads: Pad[] = [];
beforeEach(() => {
  vi.resetModules();
  now = 0; rafCb = null;
  vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal('navigator', { getGamepads: () => pads });
  vi.stubGlobal('performance', { now: () => now });
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => { rafCb = cb; return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

const loadHook = async () => (await import('../src/hooks/useGamepadNavigation')).useGamepadNavigation;

// Named as a hook so the hook-rules lint accepts calling one inside it; React
// itself is mocked above, so nothing here needs a component.
function useMountedNavigation(useGamepadNavigation: Awaited<ReturnType<typeof loadHook>>) {
  const counts = { forward: 0 };
  const noop = () => {};
  useGamepadNavigation({
    enabled: true,
    handlers: { back: noop, forward: () => { counts.forward++; }, backFast: noop, forwardFast: noop, start: noop, end: noop, branchPrev: noop, branchNext: noop },
  });
  return counts;
}
const frame = (t: number) => { now = t; const cb = rafCb; rafCb = null; cb?.(t); };

describe('gamepad navigation with two pads', () => {
  it('baseline: one pad, d-pad right held 1s repeats 6 times', async () => {
    const a = mkPad('pad A', 0); pads = [a];
    const counts = useMountedNavigation(await loadHook());
    a.buttons[15] = { pressed: true, value: 1 }; a.timestamp = 1;
    for (let f = 0; f < 60; f++) frame(f * 16.7);
    expect(counts.forward).toBe(6);
  });

  it('second connected pad with a jittery resting stick stops the hold from repeating', async () => {
    const a = mkPad('pad A (in hand)', 0), b = mkPad('pad B (idle on desk)', 1); pads = [a, b];
    const counts = useMountedNavigation(await loadHook());
    a.buttons[15] = { pressed: true, value: 1 }; a.timestamp = 1;
    for (let f = 0; f < 60; f++) {
      if (f === 3) { b.axes[0] = 0.01; b.timestamp = f * 16.7; } // one tiny jitter on B
      frame(f * 16.7);
    }
    expect(counts.forward).toBe(6); // observed 1
  });

  it('a tap on pad A is dropped when B reported a jitter in the same frame', async () => {
    const a = mkPad('pad A (in hand)', 0), b = mkPad('pad B (idle on desk)', 1); pads = [a, b];
    const counts = useMountedNavigation(await loadHook());
    frame(0);
    a.buttons[15] = { pressed: true, value: 1 }; a.timestamp = 10;   // press
    b.axes[0] = 0.01; b.timestamp = 12;                              // jitter 2ms later
    frame(16.7);
    a.buttons[15] = { pressed: false, value: 0 }; a.timestamp = 90;  // release
    frame(100);
    expect(counts.forward).toBe(1); // observed 0
  });
});
