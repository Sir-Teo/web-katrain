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

const payload = (scoreLead: number) => ({
  rootWinRate: 0.5,
  rootScoreLead: scoreLead,
  rootVisits: 100,
  moves: [{ x: 15, y: 15, order: 0, winRate: 0.5, scoreLead, visits: 60, pointsLost: 0 }],
  ownership: new Array(19 * 19).fill(0),
});

describe('a setup edit asks for a fresh analysis and drops the old one', () => {
  beforeEach(async () => {
    analyzeMock.mockReset();
    const { analysisQueue } = await import('../src/utils/analysisQueue');
    const { useGameStore } = await import('../src/store/gameStore');
    analysisQueue.cancelWhere(() => true, 'test reset');
    analysisQueue.clearCache();
    useGameStore.getState().resetGame();
    useGameStore.setState({ notification: null, isAnalysisMode: true, isTeachMode: false });
  });

  it('re-analyses the edited board', async () => {
    const { useGameStore } = await import('../src/store/gameStore');
    analyzeMock.mockResolvedValue(payload(3));
    const changed = useGameStore.getState().applySetupStones([{ x: 3, y: 3, player: 'black' }]);
    expect(changed).toBe(1);
    await waitFor(() => analyzeMock.mock.calls.length === 1);
    const request = analyzeMock.mock.calls[0]![0] as { board: Array<Array<string | null>> };
    expect(request.board[3]![3]).toBe('black');
    await waitFor(() => useGameStore.getState().currentNode.analysis !== null);
  });

  it('does not draw a result for the old stones on the edited board', async () => {
    const { useGameStore } = await import('../src/store/gameStore');
    const held: Array<(value: ReturnType<typeof payload>) => void> = [];
    analyzeMock.mockImplementation(() => new Promise((resolve) => held.push(resolve)));
    void useGameStore.getState().runAnalysis({ force: true });
    await waitFor(() => held.length === 1);
    // Edit while the first read is still out.
    useGameStore.getState().applySetupStones([{ x: 3, y: 3, player: 'white' }]);
    await waitFor(() => held.length === 2);
    // The old read completes: it must not land on the edited node.
    held[0]!(payload(-9));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(useGameStore.getState().currentNode.analysis).toBeNull();
    held[1]!(payload(4));
    await waitFor(() => useGameStore.getState().currentNode.analysis?.rootScoreLead === 4);
  });
});
