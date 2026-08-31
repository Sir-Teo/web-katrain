import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisResult } from '../src/types';

const analyzeMock = vi.fn();

vi.mock('../src/engine/katago/client', () => ({
  getKataGoEngineClient: () => ({
    analyze: analyzeMock,
    evaluateBatch: vi.fn(),
    getEngineInfo: () => ({ backend: 'test', modelName: 'test-model' }),
  }),
  isKataGoCanceledError: (err: unknown) =>
    !!err && typeof err === 'object' && (err as { kataGoCanceled?: boolean }).kataGoCanceled === true,
}));

const waitFor = async (predicate: () => boolean) => {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('Timed out waiting for store state');
};

/** A minimal analysis to hang on the current node, standing in for a live pass. */
const nodeAnalysis = (scoreLead: number): AnalysisResult =>
  ({
    rootWinRate: 0.5,
    rootScoreLead: scoreLead,
    rootVisits: 100,
    moves: [{ x: 3, y: 3, order: 0, winRate: 0.5, scoreLead, visits: 60, pointsLost: 0 }],
    territory: [],
  }) as unknown as AnalysisResult;

const payload = (scoreLead: number, best = { x: 15, y: 15 }) => ({
  rootWinRate: 0.5,
  rootScoreLead: scoreLead,
  rootVisits: 100,
  moves: [{ ...best, order: 0, winRate: 0.5, scoreLead, visits: 60, pointsLost: 0 }],
});

describe('analyzeTenuki', () => {
  beforeEach(async () => {
    analyzeMock.mockReset();
    const { analysisQueue } = await import('../src/utils/analysisQueue');
    const { useGameStore } = await import('../src/store/gameStore');
    analysisQueue.cancelWhere(() => true, 'test reset');
    analysisQueue.clearCache();
    useGameStore.getState().resetGame();
    useGameStore.setState({ notification: null, tenukiAnalysis: null });
  });

  it('refuses without an analysis to compare against, and says why', async () => {
    const { useGameStore } = await import('../src/store/gameStore');
    useGameStore.getState().analyzeTenuki();

    expect(analyzeMock).not.toHaveBeenCalled();
    const state = useGameStore.getState();
    expect(state.tenukiAnalysis).toBeNull();
    expect(state.notification?.type).toBe('error');
    expect(state.notification?.message).toMatch(/Analyze the position first/);
  });

  it('hands the engine the same board with the turn passed over', async () => {
    const { useGameStore } = await import('../src/store/gameStore');
    analyzeMock.mockResolvedValue(payload(-6));

    const store = useGameStore.getState();
    store.playMove(3, 3); // Black
    const node = useGameStore.getState().currentNode;
    node.analysis = nodeAnalysis(4);

    useGameStore.getState().analyzeTenuki();
    await waitFor(() => useGameStore.getState().tenukiAnalysis?.status === 'ready');

    const args = analyzeMock.mock.calls[0]![0];
    // White is to move after Black's stone; passing hands it back to Black.
    expect(args.currentPlayer).toBe('black');
    expect(args.board).toBe(useGameStore.getState().board);
    expect(args.moveHistory.at(-1)).toEqual({ x: -1, y: -1, player: 'white' });
    // The live search tree must not be re-rooted onto a position never played.
    expect(args.reuseTree).toBe(false);
    expect(args.analysisGroup).toBe('background');
    expect(args.positionId).toBe(`${node.id}:pass`);
  });

  it('prices the swing between playing here and passing', async () => {
    const { useGameStore } = await import('../src/store/gameStore');
    // White to move, leading. Both figures are Black-positive.
    analyzeMock.mockResolvedValue(payload(6));

    const store = useGameStore.getState();
    store.playMove(3, 3);
    useGameStore.getState().currentNode.analysis = nodeAnalysis(-4);

    useGameStore.getState().analyzeTenuki();
    await waitFor(() => useGameStore.getState().tenukiAnalysis?.status === 'ready');

    const result = useGameStore.getState().tenukiAnalysis!;
    expect(result.sideToMove).toBe('white');
    expect(result.value?.points).toBeCloseTo(10, 6);
    expect(result.followUp).toMatchObject({ x: 15, y: 15 });
  });

  it('reports an engine failure rather than hanging on "running"', async () => {
    const { useGameStore } = await import('../src/store/gameStore');
    analyzeMock.mockRejectedValue(new Error('backend unavailable'));

    useGameStore.getState().playMove(3, 3);
    useGameStore.getState().currentNode.analysis = nodeAnalysis(4);

    useGameStore.getState().analyzeTenuki();
    await waitFor(() => useGameStore.getState().tenukiAnalysis?.status === 'error');

    expect(useGameStore.getState().tenukiAnalysis?.error).toBe('backend unavailable');
  });

  it('drops a result whose node the player has already left', async () => {
    const { useGameStore } = await import('../src/store/gameStore');
    let release: ((value: unknown) => void) | null = null;
    analyzeMock.mockReturnValue(new Promise((resolve) => { release = resolve; }));

    useGameStore.getState().playMove(3, 3);
    useGameStore.getState().currentNode.analysis = nodeAnalysis(4);
    useGameStore.getState().analyzeTenuki();
    await waitFor(() => useGameStore.getState().tenukiAnalysis?.status === 'running');

    // Navigating away replaces the readout's subject; the in-flight answer is
    // about a position that is no longer on screen.
    useGameStore.getState().navigateBack();
    useGameStore.setState({ tenukiAnalysis: null });
    release!(payload(-6));
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(useGameStore.getState().tenukiAnalysis).toBeNull();
  });

  it('drops the readout the moment analysis is stopped, and stays dropped', async () => {
    const { useGameStore } = await import('../src/store/gameStore');
    // Cancelling an active queue job only aborts its signal; the rejection
    // arrives whenever the engine call settles. Waiting for that would leave
    // "Checking..." on screen after the user pressed stop. And when the late
    // answer does arrive it must not reinstate itself -- it rejects with the
    // queue's own error, not a KataGo one, which is why the handler tests
    // `isAnalysisCanceled` rather than the KataGo predicate alone.
    let settle: ((value: unknown) => void) | null = null;
    analyzeMock.mockReturnValue(new Promise((resolve) => { settle = resolve; }));

    useGameStore.getState().playMove(3, 3);
    useGameStore.getState().currentNode.analysis = nodeAnalysis(4);
    useGameStore.getState().analyzeTenuki();
    await waitFor(() => useGameStore.getState().tenukiAnalysis?.status === 'running');

    useGameStore.getState().stopAnalysis();
    expect(useGameStore.getState().tenukiAnalysis).toBeNull();

    settle!(payload(-6));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(useGameStore.getState().tenukiAnalysis).toBeNull();
  });

  it('treats a queue cancellation as a cancellation, not an engine failure', async () => {
    const { useGameStore } = await import('../src/store/gameStore');
    const { analysisQueue } = await import('../src/utils/analysisQueue');
    // Changing the komi, among other things, clears the whole queue. That
    // rejects with the queue's own `AnalysisQueueCanceledError`, which is not a
    // KataGo cancellation -- so a handler that only recognised the KataGo kind
    // put "Canceled tenuki analysis jobs" in the panel as an engine error.
    let settle: ((value: unknown) => void) | null = null;
    analyzeMock.mockReturnValue(new Promise((resolve) => { settle = resolve; }));

    useGameStore.getState().playMove(3, 3);
    useGameStore.getState().currentNode.analysis = nodeAnalysis(4);
    useGameStore.getState().analyzeTenuki();
    await waitFor(() => useGameStore.getState().tenukiAnalysis?.status === 'running');

    analysisQueue.cancelWhere(() => true, 'Komi changed');
    settle!(payload(-6));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(useGameStore.getState().tenukiAnalysis).toBeNull();
  });

  it('clears on request', async () => {
    const { useGameStore } = await import('../src/store/gameStore');
    analyzeMock.mockResolvedValue(payload(-6));
    useGameStore.getState().playMove(3, 3);
    useGameStore.getState().currentNode.analysis = nodeAnalysis(4);
    useGameStore.getState().analyzeTenuki();
    await waitFor(() => useGameStore.getState().tenukiAnalysis?.status === 'ready');

    useGameStore.getState().clearTenukiAnalysis();
    expect(useGameStore.getState().tenukiAnalysis).toBeNull();
  });

  it('never attaches the hypothetical evaluation to the game tree', async () => {
    const { useGameStore } = await import('../src/store/gameStore');
    analyzeMock.mockResolvedValue(payload(-6));

    useGameStore.getState().playMove(3, 3);
    const node = useGameStore.getState().currentNode;
    node.analysis = nodeAnalysis(4);

    useGameStore.getState().analyzeTenuki();
    await waitFor(() => useGameStore.getState().tenukiAnalysis?.status === 'ready');

    // The node keeps its own evaluation, and gains no pass child -- otherwise
    // the position would travel into exported SGF as though it were played.
    expect(node.analysis?.rootScoreLead).toBe(4);
    expect(node.children).toHaveLength(0);
  });
});
