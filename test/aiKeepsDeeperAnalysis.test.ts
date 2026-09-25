import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const { analyzeMock } = vi.hoisted(() => ({ analyzeMock: vi.fn() }));
vi.mock('../src/engine/katago/client', () => ({
  getKataGoEngineClient: () => ({ analyze: analyzeMock, getEngineInfo: () => ({ backend: 'wasm', modelName: 'm', backendNote: null }) }),
  isKataGoCanceledError: () => false,
}));
import { useGameStore } from '../src/store/gameStore';
import { payload, runAi } from './helpers/aiMoveHarness';

describe('AI search overwrites a deeper stored analysis', () => {
  beforeEach(() => { vi.useFakeTimers(); useGameStore.getState().resetGame(); });
  afterEach(() => { vi.useRealTimers(); });
  it('keeps the 5000-visit review result when the AI searched 100 visits', async () => {
    useGameStore.getState().playMove(3, 3);
    const node = useGameStore.getState().currentNode;
    const deep = { ...payload({ size: 19, moves: [{ x: 15, y: 15, scoreLead: 1.5 }], rootScoreLead: 1.5 }), rootVisits: 5000 };
    node.analysis = deep as unknown as typeof node.analysis;
    const shallow = { ...payload({ size: 19, moves: [{ x: 15, y: 15, scoreLead: 4 }], rootScoreLead: 4 }), rootVisits: 100 };
    await runAi(analyzeMock, { aiStrategy: 'default' }, shallow);
    expect(node.analysis?.rootVisits).toBe(5000);
  });
});
