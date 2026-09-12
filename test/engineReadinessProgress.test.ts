import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KataGoAnalysisPayload } from '../src/engine/katago/types';
import { useGameStore } from '../src/store/gameStore';
import { analysisQueue } from '../src/utils/analysisQueue';

const analyzeMock = vi.fn();
vi.mock('../src/engine/katago/client', () => ({
  getKataGoEngineClient: () => ({
    analyze: analyzeMock,
    getEngineInfo: () => ({ backend: 'wasm', modelName: 'loaded-test-model', backendNote: 'GPU unavailable' }),
  }),
  isKataGoCanceledError: () => false,
}));

const payload: KataGoAnalysisPayload = {
  rootWinRate: 0.5, rootScoreLead: 2, rootScoreSelfplay: 2, rootScoreStdev: 3,
  rootVisits: 16, moves: [], ownership: new Float32Array(361),
  ownershipStdev: new Float32Array(361), policy: new Float32Array(362),
};

describe('engine readiness during the first search', () => {
  beforeEach(() => {
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    useGameStore.getState().stopAnalysis();
    useGameStore.setState({ isAnalysisMode: false });
    useGameStore.getState().resetGame();
    analysisQueue.clearCache();
    useGameStore.setState({
      isAnalysisMode: true, engineStatus: 'idle', engineBackend: null,
      engineModelName: null, engineBackendNote: null, engineError: null,
    });
    analyzeMock.mockReset();
  });

  afterEach(() => {
    useGameStore.getState().stopAnalysis();
    useGameStore.setState({ isAnalysisMode: false });
    vi.restoreAllMocks();
  });

  const startSearch = () => {
    let finish!: (analysis: KataGoAnalysisPayload) => void;
    analyzeMock.mockReturnValue(new Promise<KataGoAnalysisPayload>((resolve) => { finish = resolve; }));
    const done = useGameStore.getState().runAnalysis({ force: true, visits: 1000, reportEveryMs: 250 });
    expect(analyzeMock).toHaveBeenCalledOnce();
    const request = analyzeMock.mock.calls[0]![0] as { onProgress: (analysis: KataGoAnalysisPayload) => void };
    return { done, finish, progress: () => request.onProgress(payload) };
  };

  it('reports the loaded backend as soon as live results appear, before completion', async () => {
    const search = startSearch();
    try {
      expect(useGameStore.getState().engineStatus).toBe('loading');
      search.progress();
      const state = useGameStore.getState();
      expect(state.currentNode.analysis?.rootVisits).toBe(16);
      expect(state.engineStatus).toBe('ready');
      expect(state.engineBackend).toBe('wasm');
      expect(state.engineModelName).toBe('loaded-test-model');
      expect(state.engineBackendNote).toBe('GPU unavailable');
      // Progress must not falsely credit completion of the requested depth.
      expect(state.currentNode.analysisVisitsRequested ?? 0).toBe(0);
    } finally {
      search.finish(payload);
      await search.done;
    }
  });

  it.each(['Stop', 'a model change'] as const)('ignores late progress after %s', async (action) => {
    const search = startSearch();
    try {
      if (action === 'Stop') useGameStore.getState().stopAnalysis();
      else useGameStore.getState().updateSettings({ katagoModelUrl: '/models/new-model.bin.gz' });
      search.progress();
      expect(useGameStore.getState().engineStatus).toBe('idle');
      expect(useGameStore.getState().engineBackend).toBeNull();
      expect(useGameStore.getState().currentNode.analysis).toBeNull();
    } finally {
      search.finish(payload);
      await search.done;
    }
  });
});
