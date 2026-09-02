import { beforeEach, describe, expect, it, vi } from 'vitest';

const analyzeMock = vi.fn();

vi.mock('../src/engine/katago/client', () => ({
  getKataGoEngineClient: () => ({
    analyze: analyzeMock,
    evaluateBatch: vi.fn(),
    getEngineInfo: () => ({ backend: 'test', modelName: 'test-model', backendNote: null }),
  }),
  isKataGoCanceledError: (err: unknown) =>
    !!err && typeof err === 'object' && (err as { kataGoCanceled?: boolean }).kataGoCanceled === true,
}));

const waitFor = async (predicate: () => boolean) => {
  for (let i = 0; i < 300; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('Timed out waiting for store state');
};

/** A root score the engine would report for a node: a big drop after Black's move reads as a Black blunder. */
const payload = (scoreLead: number) => ({
  rootWinRate: 0.5,
  rootScoreLead: scoreLead,
  rootVisits: 100,
  moves: [{ x: 15, y: 15, order: 0, winRate: 0.5, scoreLead, visits: 60, pointsLost: 0 }],
  ownership: new Array(19 * 19).fill(0),
});

describe('teach-mode undo only judges the move just played', () => {
  beforeEach(async () => {
    analyzeMock.mockReset();
    const { analysisQueue } = await import('../src/utils/analysisQueue');
    const { useGameStore } = await import('../src/store/gameStore');
    analysisQueue.cancelWhere(() => true, 'test reset');
    analysisQueue.clearCache();
    useGameStore.getState().resetGame();
    useGameStore.setState({ notification: null, isTeachMode: true, isAnalysisMode: true, isAiPlaying: false });
    useGameStore.getState().updateSettings({ teachNumUndoPrompts: [1, 1, 1, 1, 0, 0] });
  });

  it('does not undo a move reached by navigating through an existing game', async () => {
    const { useGameStore } = await import('../src/store/gameStore');
    const { parseSgf } = await import('../src/utils/sgf');
    useGameStore.getState().loadGame(parseSgf('(;GM[1]SZ[19];B[pd];W[dp];B[aa])'));
    const store = useGameStore.getState();
    store.navigateStart();
    // Parent (after W dp) reads +10 for Black; the child (after B aa) reads -5: a 15-point loss.
    useGameStore.getState().navigateForward();
    useGameStore.getState().navigateForward();
    useGameStore.getState().currentNode.analysis = {
      ...payload(10),
      territory: [],
    } as never;
    analyzeMock.mockResolvedValue(payload(-5));
    useGameStore.getState().navigateForward();
    const leaf = useGameStore.getState().currentNode;
    expect(leaf.move).toEqual({ x: 0, y: 0, player: 'black' });
    await useGameStore.getState().runAnalysis();
    await waitFor(() => useGameStore.getState().currentNode.analysis !== null);
    expect(useGameStore.getState().currentNode.id).toBe(leaf.id);
    expect(useGameStore.getState().notification?.message ?? '').not.toMatch(/Teaching undo/);
  });

  it('still undoes the move the player just made', async () => {
    const { useGameStore } = await import('../src/store/gameStore');
    useGameStore.getState().playMove(15, 3);
    useGameStore.getState().playMove(3, 15);
    useGameStore.getState().currentNode.analysis = { ...payload(10), territory: [] } as never;
    analyzeMock.mockResolvedValue(payload(-5));
    const before = useGameStore.getState().currentNode;
    useGameStore.getState().playMove(0, 0);
    await useGameStore.getState().runAnalysis();
    await waitFor(() => useGameStore.getState().currentNode.id === before.id);
    expect(useGameStore.getState().notification?.message).toMatch(/Teaching undo/);
  });
});

describe('replaying an existing move wakes the AI', () => {
  it('schedules the AI reply after navigating into the existing child', async () => {
    vi.useFakeTimers();
    try {
      const { useGameStore } = await import('../src/store/gameStore');
      useGameStore.getState().resetGame();
      useGameStore.setState({ isTeachMode: false, isAnalysisMode: false });
      useGameStore.getState().playMove(15, 3);
      useGameStore.getState().navigateBack();
      const makeAiMove = vi.fn();
      useGameStore.setState({ isAiPlaying: true, aiColor: 'white', makeAiMove });
      useGameStore.getState().playMove(15, 3);
      expect(useGameStore.getState().moveHistory.length).toBe(1);
      vi.advanceTimersByTime(600);
      expect(makeAiMove).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
