import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor, payload, sleepMs } from './helpers/analysisRaceHelpers';

const analyzeMock = vi.fn();
vi.mock('../src/engine/katago/client', () => ({
  getKataGoEngineClient: () => ({
    analyze: analyzeMock,
    evaluateBatch: vi.fn(),
    getEngineInfo: () => ({ backend: 'test', modelName: 'm', backendNote: null }),
  }),
  isKataGoCanceledError: () => false,
}));

describe('Undo edit during background work', () => {
  beforeEach(async () => {
    analyzeMock.mockReset();
    const { analysisQueue } = await import('../src/utils/analysisQueue');
    const { useGameStore } = await import('../src/store/gameStore');
    analysisQueue.cancelWhere(() => true, 'reset');
    analysisQueue.clearCache();
    useGameStore.getState().resetGame();
  });

  it('leaves a review marked running forever', async () => {
    const { useGameStore } = await import('../src/store/gameStore');
    const held: Array<(v: unknown) => void> = [];
    analyzeMock.mockImplementation(() => new Promise((r) => held.push(r)));
    const s = useGameStore.getState();
    s.playMove(3, 3);
    s.playMove(15, 15);
    // an undoable edit (a marker), then start a review
    useGameStore.getState().setEditTool('marker-triangle' as never);
    useGameStore.getState().applyEditTool(5, 5);
    useGameStore.getState().toggleEditMode();
    expect(useGameStore.getState().editUndoCount).toBeGreaterThan(0);
    useGameStore.getState().startFastGameAnalysis();
    await waitFor(() => held.length === 1);

    useGameStore.getState().undoEdit(); // user undoes the marker mid-review
    held[0]!(payload({ rootVisits: 25 }));
    await sleepMs(200);
    const st = useGameStore.getState();
    expect(st.isGameAnalysisRunning).toBe(false);
  });

  it('leaves play-to-end marked on after its loop was killed', async () => {
    const { useGameStore } = await import('../src/store/gameStore');
    const held: Array<(v: unknown) => void> = [];
    analyzeMock.mockImplementation(() => new Promise((r) => held.push(r)));
    const s = useGameStore.getState();
    s.playMove(3, 3);
    useGameStore.getState().setEditTool('marker-triangle' as never);
    useGameStore.getState().applyEditTool(5, 5);
    useGameStore.getState().toggleEditMode();
    useGameStore.getState().selfplayToEnd();
    await waitFor(() => held.length === 1);
    useGameStore.getState().undoEdit();
    held[0]!(payload({ moves: [] }));
    await sleepMs(200);
    const st = useGameStore.getState();
    expect(st.isSelfplayToEnd).toBe(false);
  });
});
