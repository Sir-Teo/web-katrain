import { beforeEach, describe, expect, it, vi } from 'vitest';

const analyzeMock = vi.fn();
const evaluateBatchMock = vi.fn();

vi.mock('../src/engine/katago/client', () => ({
  getKataGoEngineClient: () => ({
    analyze: analyzeMock,
    evaluateBatch: evaluateBatchMock,
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

const analysisPayload = () => ({
  rootWinRate: 0.5,
  rootScoreLead: 0,
  rootScoreSelfplay: 0,
  rootScoreStdev: 30,
  moves: [],
});

describe('game review survives queue preemption', () => {
  beforeEach(async () => {
    analyzeMock.mockReset();
    evaluateBatchMock.mockReset();

    const { analysisQueue } = await import('../src/utils/analysisQueue');
    const { useGameStore } = await import('../src/store/gameStore');
    analysisQueue.cancelWhere(() => true, 'test reset');
    analysisQueue.clearCache();
    useGameStore.getState().resetGame();
    useGameStore.setState({
      engineError: null,
      engineStatus: 'idle',
      notification: null,
    });
  });

  it('keeps a fast game review going when live analysis preempts an active position', async () => {
    const { analysisQueue } = await import('../src/utils/analysisQueue');
    const { useGameStore } = await import('../src/store/gameStore');

    // Hold every engine call until the test releases it.
    const held: Array<{ resolve: (value: ReturnType<typeof analysisPayload>) => void }> = [];
    analyzeMock.mockImplementation(() => new Promise((resolve) => {
      held.push({ resolve });
    }));

    const store = useGameStore.getState();
    store.playMove(3, 3);
    store.playMove(15, 15);
    store.startFastGameAnalysis();

    await waitFor(() => analyzeMock.mock.calls.length === 1);
    expect(useGameStore.getState().isGameAnalysisRunning).toBe(true);

    // Simulate what runAnalysis does when the user navigates during review:
    // enqueue an interactive job that preempts (aborts) the active review job.
    void analysisQueue.enqueue({
      id: 'live-analysis',
      label: 'Live analysis',
      group: 'interactive',
      priority: 100,
      preempt: true,
      run: () => new Promise<void>((resolve) => setTimeout(resolve, 5)),
    });

    // The aborted review chunk rejects as canceled even though its engine work
    // then completes.
    held[0]!.resolve(analysisPayload());
    await waitFor(() => analyzeMock.mock.calls.length === 2);

    held[1]!.resolve(analysisPayload());
    await waitFor(() => analyzeMock.mock.calls.length === 3);
    held[2]!.resolve(analysisPayload());

    await waitFor(() => !useGameStore.getState().isGameAnalysisRunning);

    const state = useGameStore.getState();
    expect(state.gameAnalysisType).toBeNull();
    expect(state.engineStatus).not.toBe('error');
    expect(state.notification).toBeNull();
    expect(analyzeMock).toHaveBeenCalledTimes(3);
  });

  it('still stops immediately when the user presses stop during review', async () => {
    const { useGameStore } = await import('../src/store/gameStore');

    const held: Array<{ resolve: (value: ReturnType<typeof analysisPayload>) => void }> = [];
    analyzeMock.mockImplementation(() => new Promise((resolve) => {
      held.push({ resolve });
    }));

    const store = useGameStore.getState();
    store.playMove(3, 3);
    store.startFastGameAnalysis();
    await waitFor(() => analyzeMock.mock.calls.length === 1);

    store.stopGameAnalysis();
    held[0]!.resolve(analysisPayload());

    await waitFor(() => !useGameStore.getState().isGameAnalysisRunning);
    expect(useGameStore.getState().gameAnalysisType).toBeNull();
    expect(useGameStore.getState().notification).toBeNull();
  });
});
