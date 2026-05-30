import { describe, expect, it, beforeEach } from 'vitest';
import type { AnalysisResult } from '../src/types';
import { useGameStore } from '../src/store/gameStore';
import { analysisQueue } from '../src/utils/analysisQueue';

const analysis = (visits: number): AnalysisResult => ({
  rootWinRate: 0.5,
  rootScoreLead: 0,
  rootScoreSelfplay: 0,
  rootScoreStdev: 1,
  rootVisits: visits,
  moves: [],
  territory: Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => 0)),
  ownershipMode: 'none',
});

describe('analysis cache store actions', () => {
  beforeEach(() => {
    analysisQueue.cancelWhere(() => true, 'test reset');
    analysisQueue.clearCache();
    useGameStore.getState().resetGame();
    useGameStore.setState({ notification: null });
  });

  it('clears queue cache and tree analysis together', async () => {
    useGameStore.getState().playMove(3, 3);
    const root = useGameStore.getState().rootNode;
    const current = useGameStore.getState().currentNode;

    root.analysis = analysis(50);
    root.analysisVisitsRequested = 50;
    current.analysis = analysis(100);
    current.analysisVisitsRequested = 100;

    useGameStore.setState((state) => ({
      analysisData: current.analysis,
      analysisCacheSize: 2,
      isContinuousAnalysis: true,
      isSelfplayToEnd: true,
      isGameAnalysisRunning: true,
      gameAnalysisType: 'fast',
      engineStatus: 'ready',
      treeVersion: state.treeVersion + 1,
    }));

    await analysisQueue.enqueue({
      id: 'raw-analysis-cache',
      group: 'test',
      priority: 1,
      cacheKey: 'raw-position',
      run: async () => ({ visits: 25 }),
    });

    expect(useGameStore.getState().analysisCacheSize).toBe(2);

    useGameStore.getState().clearAnalysisCache();
    const cleared = useGameStore.getState();

    expect(analysisQueue.getCacheSize()).toBe(0);
    expect(cleared.analysisCacheSize).toBe(0);
    expect(cleared.analysisData).toBeNull();
    expect(cleared.rootNode.analysis).toBeNull();
    expect(cleared.rootNode.children[0]?.analysis).toBeNull();
    expect(cleared.currentNode.analysis).toBeNull();
    expect(cleared.isContinuousAnalysis).toBe(false);
    expect(cleared.isSelfplayToEnd).toBe(false);
    expect(cleared.isGameAnalysisRunning).toBe(false);
    expect(cleared.engineStatus).toBe('idle');
  });
});
