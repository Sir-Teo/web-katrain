import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor, sleepMs } from './helpers/analysisRaceHelpers';

const evaluateBatchMock = vi.fn();
vi.mock('../src/engine/katago/client', () => ({
  getKataGoEngineClient: () => ({
    analyze: vi.fn(),
    evaluateBatch: evaluateBatchMock,
    getEngineInfo: () => ({ backend: 'test', modelName: 'm', backendNote: null }),
  }),
  isKataGoCanceledError: () => false,
}));

describe('quick analysis preemption retries', () => {
  beforeEach(async () => {
    const { analysisQueue } = await import('../src/utils/analysisQueue');
    const { useGameStore } = await import('../src/store/gameStore');
    analysisQueue.cancelWhere(() => true, 'reset');
    analysisQueue.clearCache();
    useGameStore.getState().resetGame();
  });

  it('skips a chunk after three preemptions spread over the whole run', async () => {
    const { analysisQueue } = await import('../src/utils/analysisQueue');
    const { useGameStore } = await import('../src/store/gameStore');
    useGameStore.setState((s) => ({ settings: { ...s.settings, katagoBatchSize: 1 } }));
    const held: Array<() => void> = [];
    evaluateBatchMock.mockImplementation((args: { positions: unknown[] }) => new Promise((r) => {
      held.push(() => r(args.positions.map(() => ({ rootWinRate: 0.5, rootScoreLead: 0, rootScoreSelfplay: 0, rootScoreStdev: 30 }))));
    }));
    const s = useGameStore.getState();
    const moves = [[3, 3], [15, 15], [3, 15], [15, 3], [9, 9]];
    for (const [x, y] of moves) s.playMove(x!, y!);
    useGameStore.getState().startQuickGameAnalysis(); // 6 nodes, one per chunk

    // Each of the first four chunks is preempted once by live analysis (user clicks around), then succeeds.
    let calls = 0;
    for (let chunk = 0; chunk < 6; chunk++) {
      await waitFor(() => held.length > calls, 'batch ' + chunk);
      if (chunk < 4) {
        void analysisQueue.enqueue({ id: 'live' + chunk, label: 'Live', group: 'interactive', priority: 100, preempt: true,
          run: () => sleepMs(1) }).catch(() => {});
        held[calls++]!(); // preempted chunk completes -> canceled
        if (chunk === 3) break;
        await waitFor(() => held.length > calls, 'retry ' + chunk);
      }
      held[calls++]!();
    }
    // release everything else
    for (let i = 0; i < 50 && useGameStore.getState().isGameAnalysisRunning; i++) {
      while (held.length > calls) held[calls++]!();
      await sleepMs(5);
    }
    const st = useGameStore.getState();
    const unanalysed: number[] = [];
    let n: typeof st.rootNode | undefined = st.rootNode; let d = 0;
    while (n) { if (!n.analysis) unanalysed.push(d); n = n.children[0]; d++; }
    expect(unanalysed).toEqual([]);
    expect(st.gameAnalysisDone).toBe(st.gameAnalysisTotal);
  });
});
