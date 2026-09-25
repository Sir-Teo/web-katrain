import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor, payload, deepMove, sleepMs } from './helpers/analysisRaceHelpers';

const analyzeMock = vi.fn();
vi.mock('../src/engine/katago/client', () => ({
  getKataGoEngineClient: () => ({
    analyze: analyzeMock,
    evaluateBatch: vi.fn(),
    getEngineInfo: () => ({ backend: 'test', modelName: 'm', backendNote: null }),
  }),
  isKataGoCanceledError: (e: unknown) => !!(e && typeof e === 'object' && (e as { canceled?: boolean }).canceled),
}));

describe('live analysis progress vs stored deeper analysis', () => {
  beforeEach(async () => {
    analyzeMock.mockReset();
    const { analysisQueue } = await import('../src/utils/analysisQueue');
    const { useGameStore } = await import('../src/store/gameStore');
    analysisQueue.cancelWhere(() => true, 'reset');
    analysisQueue.clearCache();
    useGameStore.getState().resetGame();
  });

  it('keeps a reviewed node\'s 500-visit result over an early progress snapshot', async () => {
    const { useGameStore } = await import('../src/store/gameStore');
    type Args = { positionId: string; onProgress: (p: unknown) => void; signal: AbortSignal };
    const calls: Array<{ args: Args; r: (v: unknown) => void; j: (e: unknown) => void }> = [];
    analyzeMock.mockImplementation((args: Args) => new Promise((r, j) => {
      calls.push({ args, r, j });
      args.signal.addEventListener('abort', () => j(Object.assign(new Error('canceled'), { canceled: true })));
    }));
    const s = useGameStore.getState();
    s.playMove(3, 3);
    s.playMove(15, 15);
    // node reviewed at 500 visits (full review / loaded SGF analysis)
    const node = useGameStore.getState().currentNode;
    const stored = { rootWinRate: 0.4, rootScoreLead: 3, rootScoreSelfplay: 3, rootScoreStdev: 20, rootVisits: 500,
      moves: [deepMove as never], territory: Array.from({ length: 19 }, () => new Array(19).fill(0)), ownershipMode: 'root' };
    node.analysis = stored as unknown as typeof node.analysis;
    node.analysisVisitsRequested = 500;
    useGameStore.setState((st) => ({ isAnalysisMode: true, settings: { ...st.settings, katagoVisits: 5000 } }));

    void useGameStore.getState().runAnalysis({ ifIdle: true }); // arriving on the node (Layout effect)
    await waitFor(() => calls.length === 1);
    // Progress is applied at most every 500ms from the search's start.
    await sleepMs(550);
    calls[0]!.args.onProgress(payload({ rootVisits: 12, rootScoreLead: -6, moves: [] }));
    expect(node.analysis).toBe(stored);
    // user steps on to the next move before the 5000-visit search finishes
    useGameStore.getState().navigateBack();
    void useGameStore.getState().runAnalysis({ ifIdle: true }); // Layout effect for the new node
    await waitFor(() => calls.length === 2);
    await sleepMs(20);
    expect(node.analysis).toBe(stored);
  });
});
