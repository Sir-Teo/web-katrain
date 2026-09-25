import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor, payload, deepMove } from './helpers/analysisRaceHelpers';

const analyzeMock = vi.fn();
const evaluateBatchMock = vi.fn();
vi.mock('../src/engine/katago/client', () => ({
  getKataGoEngineClient: () => ({
    analyze: analyzeMock,
    evaluateBatch: evaluateBatchMock,
    getEngineInfo: () => ({ backend: 'test', modelName: 'm', backendNote: null }),
  }),
  isKataGoCanceledError: () => false,
}));

describe('background review overwrites deeper live analysis', () => {
  beforeEach(async () => {
    analyzeMock.mockReset();
    evaluateBatchMock.mockReset();
    const { analysisQueue } = await import('../src/utils/analysisQueue');
    const { useGameStore } = await import('../src/store/gameStore');
    analysisQueue.cancelWhere(() => true, 'reset');
    analysisQueue.clearCache();
    useGameStore.getState().resetGame();
  });

  it('quick analysis replaces a 4000-visit live result with a raw NN eval', async () => {
    const { useGameStore } = await import('../src/store/gameStore');
    const held: Array<(v: unknown) => void> = [];
    analyzeMock.mockImplementation(() => new Promise((r) => held.push(r)));
    evaluateBatchMock.mockImplementation(async (args: { positions: unknown[] }) =>
      args.positions.map(() => ({ rootWinRate: 0.1, rootScoreLead: -9, rootScoreSelfplay: -9, rootScoreStdev: 30 })));

    const s = useGameStore.getState();
    s.playMove(3, 3);
    s.playMove(15, 15);
    useGameStore.setState({ isAnalysisMode: true });
    void useGameStore.getState().runAnalysis(); // live analysis of current node (move 2)
    await waitFor(() => analyzeMock.mock.calls.length === 1);

    useGameStore.getState().startQuickGameAnalysis(); // chunk includes current node (no analysis yet)
    // live analysis finishes deep
    held[0]!(payload({ rootVisits: 4000, rootScoreLead: 2.5, moves: [deepMove], ownership: new Array(361).fill(0.5) }));
    const node = useGameStore.getState().currentNode;
    await waitFor(() => !useGameStore.getState().isGameAnalysisRunning, 'quick done');
    expect(node.analysis?.rootScoreLead).toBe(2.5);
    expect(node.analysis?.moves.length).toBe(1);
  });

  it('fast review replaces a deeper live result on the node it was queued for', async () => {
    const { useGameStore } = await import('../src/store/gameStore');
    const held: Array<{ args: { visits: number }; r: (v: unknown) => void }> = [];
    analyzeMock.mockImplementation((args: { visits: number }) => new Promise((r) => held.push({ args, r })));

    const s = useGameStore.getState();
    s.playMove(3, 3);
    s.playMove(15, 15);
    useGameStore.getState().navigateStart();
    useGameStore.setState({ isAnalysisMode: true });
    void useGameStore.getState().runAnalysis(); // live analysis of root
    await waitFor(() => held.length === 1);
    useGameStore.getState().startFastGameAnalysis(); // root job queued behind live analysis
    held[0]!.r(payload({ rootVisits: 4000, rootScoreLead: 2.5, moves: [deepMove], ownership: new Array(361).fill(0.5) }));
    await waitFor(() => held.length === 2, 'fast job for root');
    const root = useGameStore.getState().rootNode;
    held[1]!.r(payload({ rootVisits: 25, rootScoreLead: -9 }));
    await waitFor(() => held.length === 3);
    held[2]!.r(payload());
    await waitFor(() => held.length === 4);
    held[3]!.r(payload());
    await waitFor(() => !useGameStore.getState().isGameAnalysisRunning, 'fast done');
    expect(root.analysis?.rootScoreLead).toBe(2.5);
  });
});
