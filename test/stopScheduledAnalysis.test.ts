import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { analysisQueue } from '../src/utils/analysisQueue';

const analyzeMock = vi.fn();
vi.mock('../src/engine/katago/client', () => ({
  getKataGoEngineClient: () => ({
    analyze: analyzeMock,
    getEngineInfo: () => ({ backend: 'wasm', modelName: 'test-model', backendNote: null }),
  }),
  isKataGoCanceledError: () => false,
}));

describe('Stop cancels analysis that has not reached the queue yet', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.getState().stopAnalysis();
    analysisQueue.clearCache();
    useGameStore.setState({ isAnalysisMode: false, isTeachMode: false, isAiPlaying: false });
    useGameStore.getState().resetGame();
    analyzeMock.mockReset().mockResolvedValue({
      rootWinRate: 0.5, rootScoreLead: 0, rootScoreSelfplay: 0,
      rootScoreStdev: 0, rootVisits: 16, ownership: new Float32Array(361), moves: [],
    });
  });

  afterEach(() => {
    useGameStore.getState().stopAnalysis();
    useGameStore.setState({ isAnalysisMode: false });
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it.each(['new move', 'existing move', 'pass', 'setup edit'] as const)(
    'does not restart after Stop follows a %s', async (action) => {
      if (action === 'existing move') {
        useGameStore.getState().playMove(3, 3);
        useGameStore.getState().navigateBack();
      }
      useGameStore.setState({ isAnalysisMode: true });
      if (action === 'pass') useGameStore.getState().passTurn();
      else if (action === 'setup edit') useGameStore.getState().applySetupStones([{ x: 3, y: 3, player: 'black' }]);
      else useGameStore.getState().playMove(3, 3);
      expect(analyzeMock).not.toHaveBeenCalled();

      useGameStore.getState().stopAnalysis();
      await vi.advanceTimersByTimeAsync(1000);
      expect(analyzeMock, 'a delayed callback restarted analysis after Stop').not.toHaveBeenCalled();

      // Stopping old work must still allow a new explicit request.
      await useGameStore.getState().runAnalysis({ force: true });
      expect(analyzeMock).toHaveBeenCalledOnce();
    },
  );

  it('does not refill analysis immediately after the user clears it', async () => {
    useGameStore.setState({ isAnalysisMode: true });
    useGameStore.getState().playMove(3, 3);
    useGameStore.getState().clearAnalysisCache();
    await vi.advanceTimersByTimeAsync(1000);
    expect(analyzeMock).not.toHaveBeenCalled();
    expect(useGameStore.getState().currentNode.analysis).toBeNull();
  });
});
