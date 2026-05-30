import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { AnalysisResult } from '../src/types';
import { useGameStore } from '../src/store/gameStore';
import { analysisQueue } from '../src/utils/analysisQueue';
import { getHandicapPoints } from '../src/utils/boardSize';

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

  it('changing komi updates every node and invalidates stale analysis', async () => {
    useGameStore.getState().playMove(3, 3);
    useGameStore.getState().playMove(15, 15);
    const root = useGameStore.getState().rootNode;
    const first = root.children[0]!;
    const current = useGameStore.getState().currentNode;

    root.analysis = analysis(50);
    first.analysis = analysis(75);
    current.analysis = analysis(100);
    root.analysisVisitsRequested = 50;
    first.analysisVisitsRequested = 75;
    current.analysisVisitsRequested = 100;

    useGameStore.setState((state) => ({
      analysisData: current.analysis,
      analysisCacheSize: 3,
      isContinuousAnalysis: true,
      isSelfplayToEnd: true,
      isGameAnalysisRunning: true,
      gameAnalysisType: 'full',
      engineStatus: 'ready',
      treeVersion: state.treeVersion + 1,
    }));

    await analysisQueue.enqueue({
      id: 'komi-sensitive-cache',
      group: 'test',
      priority: 1,
      cacheKey: 'komi-position',
      run: async () => ({ visits: 25 }),
    });

    useGameStore.getState().setKomi(7.5);
    const changed = useGameStore.getState();

    expect(changed.komi).toBe(7.5);
    expect(changed.rootNode.properties?.KM).toEqual(['7.5']);
    expect(changed.rootNode.gameState.komi).toBe(7.5);
    expect(changed.rootNode.children[0]?.gameState.komi).toBe(7.5);
    expect(changed.currentNode.gameState.komi).toBe(7.5);
    expect(changed.analysisData).toBeNull();
    expect(changed.rootNode.analysis).toBeNull();
    expect(changed.rootNode.children[0]?.analysis).toBeNull();
    expect(changed.currentNode.analysis).toBeNull();
    expect(analysisQueue.getCacheSize()).toBe(0);
    expect(changed.analysisCacheSize).toBe(0);
    expect(changed.isContinuousAnalysis).toBe(false);
    expect(changed.isSelfplayToEnd).toBe(false);
    expect(changed.isGameAnalysisRunning).toBe(false);
    expect(changed.engineStatus).toBe('idle');
  });

  it('routes SGF KM property edits through the komi state', () => {
    useGameStore.getState().setRootProperty('KM', '0');
    const changed = useGameStore.getState();

    expect(changed.komi).toBe(0);
    expect(changed.rootNode.gameState.komi).toBe(0);
    expect(changed.rootNode.properties?.KM).toEqual(['0']);
  });

  it('normalizes matching komi text without clearing analysis', () => {
    const root = useGameStore.getState().rootNode;
    root.analysis = analysis(50);
    useGameStore.setState({ analysisData: root.analysis, analysisCacheSize: 1 });

    useGameStore.getState().setRootProperty('KM', '6.50');
    const changed = useGameStore.getState();

    expect(changed.komi).toBe(6.5);
    expect(changed.rootNode.properties?.KM).toEqual(['6.5']);
    expect(changed.rootNode.analysis).not.toBeNull();
    expect(changed.analysisData).not.toBeNull();
    expect(changed.analysisCacheSize).toBe(1);
  });

  it('routes SGF RU edits through rules settings and analysis invalidation', async () => {
    useGameStore.getState().playMove(3, 3);
    const root = useGameStore.getState().rootNode;
    const current = useGameStore.getState().currentNode;

    root.analysis = analysis(50);
    current.analysis = analysis(100);
    useGameStore.setState((state) => ({
      analysisData: current.analysis,
      analysisCacheSize: 2,
      isContinuousAnalysis: true,
      isGameAnalysisRunning: true,
      gameAnalysisType: 'fast',
      engineStatus: 'ready',
      treeVersion: state.treeVersion + 1,
    }));

    await analysisQueue.enqueue({
      id: 'rules-sensitive-cache',
      group: 'test',
      priority: 1,
      cacheKey: 'rules-position',
      run: async () => ({ visits: 25 }),
    });

    useGameStore.getState().setRootProperty('RU', 'Chinese');
    const changed = useGameStore.getState();

    expect(changed.settings.gameRules).toBe('chinese');
    expect(changed.rootNode.properties?.RU).toEqual(['Chinese']);
    expect(changed.analysisData).toBeNull();
    expect(changed.rootNode.analysis).toBeNull();
    expect(changed.currentNode.analysis).toBeNull();
    expect(analysisQueue.getCacheSize()).toBe(0);
    expect(changed.analysisCacheSize).toBe(0);
    expect(changed.isContinuousAnalysis).toBe(false);
    expect(changed.isGameAnalysisRunning).toBe(false);
    expect(changed.engineStatus).toBe('idle');
  });

  it('normalizes matching rules text without clearing analysis', () => {
    useGameStore.getState().updateSettings({ gameRules: 'japanese' });
    const root = useGameStore.getState().rootNode;
    root.properties = { ...(root.properties ?? {}), RU: ['JP'] };
    root.analysis = analysis(50);
    useGameStore.setState({ analysisData: root.analysis, analysisCacheSize: 1 });

    useGameStore.getState().setRootProperty('RU', 'Japanese');
    const changed = useGameStore.getState();

    expect(changed.settings.gameRules).toBe('japanese');
    expect(changed.rootNode.properties?.RU).toEqual(['Japanese']);
    expect(changed.rootNode.analysis).not.toBeNull();
    expect(changed.analysisData).not.toBeNull();
    expect(changed.analysisCacheSize).toBe(1);
  });

  it('changing handicap updates root setup stones and invalidates stale analysis', async () => {
    const root = useGameStore.getState().rootNode;
    root.analysis = analysis(50);
    useGameStore.setState((state) => ({
      analysisData: root.analysis,
      analysisCacheSize: 1,
      isContinuousAnalysis: true,
      isSelfplayToEnd: true,
      isGameAnalysisRunning: true,
      gameAnalysisType: 'fast',
      engineStatus: 'ready',
      treeVersion: state.treeVersion + 1,
    }));

    await analysisQueue.enqueue({
      id: 'handicap-sensitive-cache',
      group: 'test',
      priority: 1,
      cacheKey: 'handicap-position',
      run: async () => ({ visits: 25 }),
    });

    useGameStore.getState().setHandicap(4);
    const changed = useGameStore.getState();

    expect(changed.rootNode.properties?.HA).toEqual(['4']);
    expect(changed.rootNode.properties?.PL).toEqual(['W']);
    expect(changed.rootNode.gameState.currentPlayer).toBe('white');
    expect(changed.currentPlayer).toBe('white');
    for (const [x, y] of getHandicapPoints(19, 4)) {
      expect(changed.rootNode.gameState.board[y]?.[x]).toBe('black');
      expect(changed.board[y]?.[x]).toBe('black');
    }
    expect(changed.analysisData).toBeNull();
    expect(changed.rootNode.analysis).toBeNull();
    expect(analysisQueue.getCacheSize()).toBe(0);
    expect(changed.analysisCacheSize).toBe(0);
    expect(changed.isContinuousAnalysis).toBe(false);
    expect(changed.isSelfplayToEnd).toBe(false);
    expect(changed.isGameAnalysisRunning).toBe(false);
    expect(changed.engineStatus).toBe('idle');
  });

  it('stamps new games with the current SGF date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 30, 12, 0, 0));

    try {
      useGameStore.getState().startNewGame({ komi: 6.5, rules: 'japanese', boardSize: 19, handicap: 0 });
      expect(useGameStore.getState().rootNode.properties?.DT).toEqual(['2026-05-30']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('routes SGF HA edits through handicap state and clears handicap stones', () => {
    useGameStore.getState().setRootProperty('HA', '4');
    useGameStore.getState().setRootProperty('HA', '');
    const changed = useGameStore.getState();

    expect(changed.rootNode.properties?.HA).toBeUndefined();
    expect(changed.rootNode.properties?.PL).toBeUndefined();
    expect(changed.rootNode.gameState.currentPlayer).toBe('black');
    for (const [x, y] of getHandicapPoints(19, 4)) {
      expect(changed.rootNode.gameState.board[y]?.[x]).toBeNull();
    }
  });

  it('normalizes matching handicap text without clearing analysis', () => {
    useGameStore.getState().setHandicap(4);
    const root = useGameStore.getState().rootNode;
    root.properties = { ...(root.properties ?? {}), HA: ['04'], PL: ['W'] };
    root.analysis = analysis(50);
    useGameStore.setState({ analysisData: root.analysis, analysisCacheSize: 1 });

    useGameStore.getState().setRootProperty('HA', '4');
    const changed = useGameStore.getState();

    expect(changed.rootNode.properties?.HA).toEqual(['4']);
    expect(changed.rootNode.properties?.PL).toEqual(['W']);
    expect(changed.rootNode.analysis).not.toBeNull();
    expect(changed.analysisData).not.toBeNull();
    expect(changed.analysisCacheSize).toBe(1);
  });
});
