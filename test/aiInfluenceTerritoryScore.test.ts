import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const { analyzeMock } = vi.hoisted(() => ({ analyzeMock: vi.fn() }));
vi.mock('../src/engine/katago/client', () => ({
  getKataGoEngineClient: () => ({ analyze: analyzeMock, getEngineInfo: () => ({ backend: 'wasm', modelName: 'm', backendNote: null }) }),
  isKataGoCanceledError: () => false,
}));
import { useGameStore } from '../src/store/gameStore';
import { payload, runAi } from './helpers/aiMoveHarness';

describe('influence/territory pick ranks sampled moves by policy*weight (KaTrain)', () => {
  beforeEach(() => { vi.useFakeTimers(); useGameStore.getState().resetGame(); });
  afterEach(() => { vi.useRealTimers(); });

  it('influence: 1-1 point (weight 1e-5) must not beat a centre move', async () => {
    // KaTrain: weighted_coords = (policy*weight, weight, x, y); nlargest(5) by policy*weight.
    // (0,0): exponent (2.5)+(2.5)=5 -> w=1e-5 -> score 0.4e-5 ; (9,9): w=1 -> score 0.3
    // n_moves = int(0.3*2+5)=5 >= 2, so both are always sampled -> KaTrain always plays (9,9).
    const resp = payload({ size: 19, policy: { '0,0': 0.4, '9,9': 0.3 }, pass: 0 });
    const mv = await runAi(analyzeMock, { aiStrategy: 'influence' }, resp);
    expect(mv).toEqual({ x: 9, y: 9 });
  });

  it('territory: centre move (weight 0.5^6.5) must not beat a 3-3 move', async () => {
    // thr_line=2.5; (9,9): exponent max(0,9-2.5)=6.5 -> w=0.011 -> score 0.0045 ; (2,2): w=1 -> 0.3
    const resp = payload({ size: 19, policy: { '9,9': 0.4, '2,2': 0.3 }, pass: 0 });
    const mv = await runAi(analyzeMock, { aiStrategy: 'territory' }, resp);
    expect(mv).toEqual({ x: 2, y: 2 });
  });
});
