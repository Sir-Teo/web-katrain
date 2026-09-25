import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const { analyzeMock } = vi.hoisted(() => ({ analyzeMock: vi.fn() }));
vi.mock('../src/engine/katago/client', () => ({
  getKataGoEngineClient: () => ({ analyze: analyzeMock, getEngineInfo: () => ({ backend: 'wasm', modelName: 'm', backendNote: null }) }),
  isKataGoCanceledError: () => false,
}));
import { useGameStore } from '../src/store/gameStore';
import { payload, runAi } from './helpers/aiMoveHarness';

describe('KataHandicap: PDA-biased search must not become the node analysis', () => {
  beforeEach(() => { vi.useFakeTimers(); useGameStore.getState().resetGame(); });
  afterEach(() => { vi.useRealTimers(); });

  it('an unbiased analysis is requested for the position after the handicap bot moved', async () => {
    useGameStore.getState().playMove(3, 3); // human (black) move; AI (white) answers
    const humanNode = useGameStore.getState().currentNode;
    const biased = { ...payload({ size: 19, moves: [{ x: 15, y: 15, scoreLead: -12 }], rootScoreLead: -12 }), rootVisits: useGameStore.getState().settings.katagoVisits };
    const mv = await runAi(analyzeMock, { aiStrategy: 'handicap', aiHandicapAutomatic: false, aiHandicapPda: -2 }, biased);
    expect(mv).toEqual({ x: 15, y: 15 });
    expect(analyzeMock.mock.calls[0]![0].playoutDoublingAdvantage).toBe(-2);
    // KaTrain requests the PDA analysis separately (request_ai_analysis) and never stores it on cn.
    // Here it is stored as humanNode.analysis, and runAnalysis then reuses it.
    const stored = humanNode.analysis;
    analyzeMock.mockReset().mockResolvedValue(payload({ size: 19, moves: [{ x: 15, y: 15, scoreLead: 0.5 }], rootScoreLead: 0.5 }));
    useGameStore.setState({ isAnalysisMode: true });
    await useGameStore.getState().runAnalysis();
    await vi.advanceTimersByTimeAsync(500);
    expect.soft(stored?.rootScoreLead, 'PDA-biased score stored as the position\'s evaluation').not.toBe(-12);
    expect.soft(analyzeMock, 'normal analysis never re-requested for this node').toHaveBeenCalled();
  });
});
