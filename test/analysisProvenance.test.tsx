import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_BOARD_SIZE, type AnalysisResult } from '../src/types';
import { describeAnalysisProvenance, formatAnalysisProvenance, UNKNOWN_PROVENANCE_LABEL } from '../src/utils/analysisProvenance';
import { payload } from './helpers/analysisRaceHelpers';

const analyzeMock = vi.fn();
vi.mock('../src/engine/katago/client', () => ({
  getKataGoEngineClient: () => ({
    analyze: analyzeMock,
    evaluateBatch: vi.fn(),
    getEngineInfo: () => ({ backend: 'test', modelName: 'kata1-b18c384', backendNote: null }),
  }),
  isKataGoCanceledError: (e: unknown) => !!(e && typeof e === 'object' && (e as { canceled?: boolean }).canceled),
}));

const territory = () => Array.from({ length: DEFAULT_BOARD_SIZE }, () => Array(DEFAULT_BOARD_SIZE).fill(0));
const legacyResult = (): AnalysisResult => ({ rootWinRate: 0.6, rootScoreLead: 2, rootVisits: 500, moves: [], territory: territory() });

describe('analysis provenance', () => {
  beforeEach(async () => {
    analyzeMock.mockReset();
    const { analysisQueue } = await import('../src/utils/analysisQueue');
    const { useGameStore } = await import('../src/store/gameStore');
    analysisQueue.cancelWhere(() => true, 'reset');
    analysisQueue.clearCache();
    useGameStore.getState().resetGame();
  });

  it('describes a result without provenance as unknown, and one with it by its facts', () => {
    expect(formatAnalysisProvenance(null)).toBeNull();
    expect(formatAnalysisProvenance(legacyResult())).toBe(UNKNOWN_PROVENANCE_LABEL);
    expect(describeAnalysisProvenance({
      source: 'local', modelUrl: 'https://example.com/models/b28.bin.gz?v=2', rules: 'japanese', komi: 6.5, visits: 400,
    })).toEqual(['This app (KataGo)', 'b28.bin.gz', '400 visits', 'Japanese, komi 6.5']);
    expect(describeAnalysisProvenance({ source: 'imported-kaya', modelName: 'kata1-b18', komi: 7 }))
      .toEqual(['Imported from Kaya', 'kata1-b18', 'komi 7']);
  });

  it('records the model, rules, komi and budget on local engine results', async () => {
    const { useGameStore } = await import('../src/store/gameStore');
    analyzeMock.mockImplementation((args: { visits: number }) =>
      Promise.resolve(payload({ rootVisits: args.visits, rootScoreLead: 3 })));
    useGameStore.getState().updateSettings({
      soundEnabled: false, katagoModelUrl: 'models/test.bin.gz', gameRules: 'chinese', katagoVisits: 64, katagoMaxTimeMs: 3000,
    });
    useGameStore.getState().setKomi(7.5);
    useGameStore.getState().playMove(3, 3);
    useGameStore.setState({ isAnalysisMode: true });
    await useGameStore.getState().runAnalysis();
    expect(useGameStore.getState().currentNode.analysis?.provenance).toMatchObject({
      source: 'local',
      modelName: 'kata1-b18c384',
      rules: 'chinese',
      komi: 7.5,
      visits: 64,
      maxTimeMs: 3000,
    });
    expect(useGameStore.getState().currentNode.analysis?.provenance?.modelUrl).toContain('test.bin.gz');
  });

  it('marks results read from KaTrain KT and Kaya KA as imported', async () => {
    const { useGameStore } = await import('../src/store/gameStore');
    const { generateSgfFromTree, parseSgf } = await import('../src/utils/sgf');

    useGameStore.getState().loadGame(parseSgf(
      '(;GM[1]SZ[19]RU[Japanese]KM[6.5];B[pd]KA[{"w":0.55,"s":1.5,"v":1000,"m":[{"m":"D4","p":0.54,"w":0.57,"s":2,"v":80}\\]}])'
    ));
    expect(useGameStore.getState().rootNode.children[0]?.analysis?.provenance).toEqual({
      source: 'imported-kaya', rules: 'japanese', komi: 6.5, visits: 1000,
    });

    useGameStore.getState().resetGame();
    useGameStore.getState().playMove(3, 3);
    useGameStore.getState().currentNode.analysis = legacyResult();
    const sgf = generateSgfFromTree(useGameStore.getState().rootNode, { trainer: { saveAnalysis: true } });
    expect(sgf).toContain('KT[');
    useGameStore.getState().loadGame(parseSgf(sgf));
    expect(useGameStore.getState().rootNode.children[0]?.analysis?.provenance).toMatchObject({ source: 'imported-katrain' });
  });

  it('shows the source in the analysis panel, and says so when it is unknown', async () => {
    const { useGameStore } = await import('../src/store/gameStore');
    const { AnalysisPanel } = await import('../src/components/AnalysisPanel');
    const { defaultUiState } = await import('../src/components/layout/types');
    const noop = () => undefined;
    const props = {
      analysisControls: defaultUiState().analysisControls.analyze,
      updateControls: noop, statusText: 'Ready', engineDot: '', engineMeta: '', engineMetaTitle: '',
      engineStatus: 'ready' as const, engineError: null, engineBackend: 'webgpu', engineModelLabel: 'kata1',
      requestedBackend: 'webgpu', modelUrl: '/models/kata1.bin.gz', isGameAnalysisRunning: false,
      gameAnalysisType: null, gameAnalysisDone: 0, gameAnalysisTotal: 0, startQuickGameAnalysis: noop,
      startFastGameAnalysis: noop, stopGameAnalysis: noop, clearAnalysisCache: noop, analysisCacheSize: 0,
      onOpenGameAnalysis: noop, onOpenGameReport: noop, currentMoveNumber: 0, winRate: 0.6, scoreLead: 2,
      pointsLost: null, analysisExperienceOverride: 'pro' as const,
    };

    // Server rendering reads the store's initial state (zustand's server snapshot).
    const node = useGameStore.getInitialState().currentNode;
    node.analysis = legacyResult();
    let html = renderToStaticMarkup(<AnalysisPanel {...props} />);
    expect(html).toContain('data-analysis-provenance="unknown"');
    expect(html).toContain('Unknown provenance');

    node.analysis = {
      ...legacyResult(),
      provenance: { source: 'imported-katrain', rules: 'japanese', komi: 6.5, visits: 500 },
    };
    html = renderToStaticMarkup(<AnalysisPanel {...props} />);
    expect(html).toContain('data-analysis-provenance="imported-katrain"');
    expect(html).toContain('title="Analysis source: Imported from KaTrain · 500 visits · Japanese, komi 6.5"');
    node.analysis = null;
  });
});
