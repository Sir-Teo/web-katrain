import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const analyze = vi.fn(), evaluate = vi.fn(), evaluateBatch = vi.fn();
vi.mock('../src/engine/katago/client', () => ({
  getKataGoEngineClient: () => ({ analyze, evaluate, evaluateBatch, getEngineInfo: () => ({ backend: 'test', modelName: 'test' }) }),
  isKataGoCanceledError: () => false,
}));
const { useGameStore } = await import('../src/store/gameStore');
const { analysisQueue } = await import('../src/utils/analysisQueue');
const { parseSgf } = await import('../src/utils/sgf');
const { evaluateNode } = await import('../src/utils/positionEval');
const state = () => useGameStore.getState();
const result = { rootWinRate: 0.5, rootScoreLead: 0, rootScoreSelfplay: 0, rootScoreStdev: 10, rootVisits: 100, moves: [], ownershipMode: 'root' as const, ownership: new Float32Array(81) };
const waitFor = async (predicate: () => boolean) => {
  for (let i = 0; i < 500; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 2));
  }
  throw Error('Handicap analysis caller did not finish');
};
beforeEach(() => {
  state().stopAnalysis(); analysisQueue.clearCache(); state().resetGame();
  state().updateSettings({ soundEnabled: false, loadSgfFastAnalysis: false, katagoOwnershipMode: 'root' });
  useGameStore.setState({ isAnalysisMode: false, isAiPlaying: false, engineError: null });
  analyze.mockReset().mockResolvedValue(result); evaluate.mockReset().mockResolvedValue(result);
  evaluateBatch.mockReset().mockImplementation((args: { positions: unknown[] }) => Promise.resolve(args.positions.map(() => result)));
});
afterEach(() => state().stopAnalysis());

describe.each(['Chinese', 'AGA', 'Japanese'])('free handicap compensation in %s workflows', rules => {
  it.each(['live', 'tenuki', 'quick', 'fast', 'full', 'ai', 'selfplay', 'position-eval'] as const)('carries compensation through %s', async mode => {
    state().loadGame(parseSgf(`(;SZ[9]HA[2]KM[0.5]RU[${rules}];B[gc];B[cg];W[gg])`));
    state().navigateEnd();
    if (mode === 'live') { useGameStore.setState({ isAnalysisMode: true }); await state().runAnalysis({ force: true }); }
    else if (mode === 'tenuki') { state().currentNode.analysis = { ...result, territory: [] }; state().analyzeTenuki(); await waitFor(() => state().tenukiAnalysis?.status === 'ready'); }
    else if (mode === 'quick' || mode === 'fast' || mode === 'full') {
      if (mode === 'quick') state().startQuickGameAnalysis();
      else if (mode === 'fast') state().startFastGameAnalysis();
      else state().startFullGameAnalysis({ visits: 16 });
      await waitFor(() => !state().isGameAnalysisRunning);
    } else if (mode === 'ai') { state().makeAiMove({ force: true }); await waitFor(() => analyze.mock.calls.length > 0 && !state().isAiThinking); }
    else if (mode === 'selfplay') { state().selfplayToEnd(); await waitFor(() => !state().isSelfplayToEnd); }
    else await evaluateNode(state().currentNode, state().settings);
    const requests = mode === 'quick' ? evaluateBatch.mock.calls.flatMap(([args]) => args.positions)
      : mode === 'position-eval' ? evaluate.mock.calls.map(([args]) => args)
      : analyze.mock.calls.map(([args]) => args);
    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) {
      const bonus = request.moveHistory.length < 2 ? 0 : rules === 'Chinese' ? 2 : rules === 'AGA' ? 1 : 0;
      expect(request.komi, `move ${request.moveHistory.length}`).toBe(0.5 + bonus);
    }
  });
});
