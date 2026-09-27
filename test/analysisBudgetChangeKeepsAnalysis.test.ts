import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor, payload, sleepMs } from './helpers/analysisRaceHelpers';
import type { AnalysisResult } from '../src/types';

const analyzeMock = vi.fn();
vi.mock('../src/engine/katago/client', () => ({
  getKataGoEngineClient: () => ({
    analyze: analyzeMock,
    evaluateBatch: vi.fn(),
    getEngineInfo: () => ({ backend: 'test', modelName: 'm', backendNote: null }),
  }),
  isKataGoCanceledError: (e: unknown) => !!(e && typeof e === 'object' && (e as { canceled?: boolean }).canceled),
}));

const evaluation = (rootVisits: number, rootScoreLead = 4): AnalysisResult => ({
  rootWinRate: 0.6, rootScoreLead, rootVisits, moves: [], ownershipMode: 'root',
  territory: Array.from({ length: 19 }, () => Array(19).fill(0)),
});

describe('changing the search budget keeps existing analysis', () => {
  beforeEach(async () => {
    analyzeMock.mockReset();
    const { analysisQueue } = await import('../src/utils/analysisQueue');
    const { useGameStore } = await import('../src/store/gameStore');
    analysisQueue.cancelWhere(() => true, 'reset');
    analysisQueue.clearCache();
    useGameStore.getState().resetGame();
    useGameStore.getState().updateSettings({
      soundEnabled: false, katagoModelUrl: 'models/a.bin.gz', gameRules: 'japanese', katagoWideRootNoise: 0,
      katagoVisits: 100, katagoMaxTimeMs: 5000, katagoOwnershipMode: 'root', analysisShowPolicy: false,
    });
  });

  it('keeps every node\'s result when visits, time or batch size change', async () => {
    const { useGameStore } = await import('../src/store/gameStore');
    const s = useGameStore.getState();
    s.playMove(3, 3);
    s.playMove(15, 15);
    const root = useGameStore.getState().rootNode;
    const first = root.children[0]!;
    const second = first.children[0]!;
    root.analysis = evaluation(100, 1);
    first.analysis = evaluation(100, 2);
    second.analysis = evaluation(100, 3);
    useGameStore.setState({ analysisData: second.analysis, analysisCacheSize: 3 });

    useGameStore.getState().updateSettings({ katagoVisits: 400 });
    useGameStore.getState().updateSettings({ katagoMaxTimeMs: 20000 });
    useGameStore.getState().updateSettings({ katagoBatchSize: 8 });

    expect(useGameStore.getState().settings.katagoVisits).toBe(400);
    expect(root.analysis?.rootScoreLead).toBe(1);
    expect(first.analysis?.rootScoreLead).toBe(2);
    expect(second.analysis?.rootScoreLead).toBe(3);
    expect(useGameStore.getState().analysisData).toBe(second.analysis);
    expect(useGameStore.getState().analysisCacheSize).toBe(3);
  });

  it('still clears results when the model, rules or search behaviour change', async () => {
    const { useGameStore } = await import('../src/store/gameStore');
    const root = useGameStore.getState().rootNode;
    for (const change of [
      { katagoModelUrl: 'models/b.bin.gz' },
      { gameRules: 'chinese' as const },
      { katagoWideRootNoise: 0.25 },
      { katagoVisits: 800, katagoModelUrl: 'models/c.bin.gz' },
    ]) {
      root.analysis = evaluation(100);
      useGameStore.getState().updateSettings(change);
      expect(root.analysis, JSON.stringify(change)).toBeNull();
    }
  });

  it('re-searches a node that has fewer visits than the new target, and only those', async () => {
    const { useGameStore } = await import('../src/store/gameStore');
    type Args = { visits: number; signal: AbortSignal };
    const calls: Args[] = [];
    analyzeMock.mockImplementation((args: Args) => {
      calls.push(args);
      return Promise.resolve(payload({ rootVisits: args.visits, rootScoreLead: 9 }));
    });
    useGameStore.getState().playMove(3, 3);
    const node = useGameStore.getState().currentNode;
    node.analysis = evaluation(100);
    node.analysisVisitsRequested = 100;
    useGameStore.setState({ isAnalysisMode: true });

    await useGameStore.getState().runAnalysis();
    expect(calls).toHaveLength(0);

    useGameStore.getState().updateSettings({ katagoVisits: 250 });
    // The shallower result is still shown while the deeper search runs.
    expect(node.analysis?.rootScoreLead).toBe(4);
    await useGameStore.getState().runAnalysis();
    await waitFor(() => calls.length === 1);
    expect(calls[0]!.visits).toBe(250);
    await sleepMs(0);
    expect(node.analysis?.rootVisits).toBe(250);
    expect(node.analysis?.rootScoreLead).toBe(9);

    // Lowering the budget keeps the deeper result and searches nothing.
    useGameStore.getState().updateSettings({ katagoVisits: 50 });
    await useGameStore.getState().runAnalysis();
    expect(calls).toHaveLength(1);
    expect(node.analysis?.rootVisits).toBe(250);
  });
});
