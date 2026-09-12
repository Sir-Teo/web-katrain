import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameNode } from '../src/types';
import { situationalKey } from '../src/utils/superko';
import { repetitionHistoryForNode } from '../src/utils/treeSuperko';
import { tripleKoFixture } from './helpers/superkoFixture';

const analyze = vi.fn();
const evaluate = vi.fn();
const evaluateBatch = vi.fn();
vi.mock('../src/engine/katago/client', () => ({
  getKataGoEngineClient: () => ({analyze, evaluate, evaluateBatch, getEngineInfo:() => ({backend:'test',modelName:'test'})}),
  isKataGoCanceledError: () => false,
}));
const {useGameStore} = await import('../src/store/gameStore');
const {analysisQueue} = await import('../src/utils/analysisQueue');
const {parseSgf} = await import('../src/utils/sgf');
const {evaluateNode} = await import('../src/utils/positionEval');
const state = () => useGameStore.getState();
const result = {rootWinRate:0.5, rootScoreLead:0, rootScoreSelfplay:0, rootScoreStdev:10, rootVisits:100, moves:[], ownershipMode:'root' as const, ownership:new Float32Array(81)};
const waitFor = async (predicate:() => boolean) => {
  for (let i = 0; i < 500; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 2));
  }
  throw Error('Analysis caller did not finish');
};

beforeEach(() => {
  state().stopAnalysis();
  analysisQueue.clearCache();
  state().resetGame();
  state().updateSettings({soundEnabled:false, loadSgfFastAnalysis:false, gameRules:'aga', katagoOwnershipMode:'root'});
  useGameStore.setState({isAnalysisMode:false, isAiPlaying:false, engineError:null});
  const {history,moves} = tripleKoFixture();
  const setup = {black:[] as string[],white:[] as string[]};
  const coord = (x:number,y:number) => String.fromCharCode(97+x,97+y);
  history[0]!.board.forEach((row,y) => row.forEach((stone,x) => {if (stone) setup[stone].push(`[${coord(x,y)}]`);}));
  state().loadGame(parseSgf(`(;SZ[9]RU[AGA]KM[7]AB${setup.black.join('')}AW${setup.white.join('')}${moves.map(m => `;${m.player === 'black' ? 'B' : 'W'}[${coord(m.x,m.y)}]`).join('')})`));
  state().navigateEnd();
  analyze.mockReset().mockResolvedValue(result);
  evaluate.mockReset().mockResolvedValue(result);
  evaluateBatch.mockReset().mockImplementation((args:{positions:unknown[]}) => Promise.resolve(args.positions.map(() => result)));
});
afterEach(() => state().stopAnalysis());

describe('full repetition history in every analysis workflow', () => {
  it.each(['live','tenuki','quick','fast','full','ai','selfplay','position-eval'] as const)('preserves the complete game line for %s', async mode => {
    if (mode === 'live') {
      useGameStore.setState({isAnalysisMode:true});
      await state().runAnalysis({force:true});
    } else if (mode === 'tenuki') {
      state().currentNode.analysis = {...result, territory:[]};
      state().analyzeTenuki();
      await waitFor(() => state().tenukiAnalysis?.status === 'ready');
    } else if (mode === 'quick' || mode === 'fast' || mode === 'full') {
      if (mode === 'quick') state().startQuickGameAnalysis();
      else if (mode === 'fast') state().startFastGameAnalysis();
      else state().startFullGameAnalysis({visits:16});
      await waitFor(() => !state().isGameAnalysisRunning);
    } else if (mode === 'ai') {
      state().makeAiMove({force:true});
      await waitFor(() => analyze.mock.calls.length > 0 && !state().isAiThinking);
    } else if (mode === 'selfplay') {
      state().selfplayToEnd();
      await waitFor(() => !state().isSelfplayToEnd);
    } else {
      await evaluateNode(state().currentNode, state().settings);
    }
    const nodes: GameNode[] = [];
    const stack = [state().rootNode];
    while (stack.length) {const node = stack.pop()!; nodes.push(node); stack.push(...node.children);}
    const requests = mode === 'quick' ? evaluateBatch.mock.calls.flatMap(([args]) => args.positions)
      : mode === 'position-eval' ? evaluate.mock.calls.map(([args]) => args)
      : analyze.mock.calls.map(([args]) => args);
    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) {
      const node = nodes.find(n => n.gameState.board === request.board && n.gameState.currentPlayer === request.currentPlayer && n.gameState.moveHistory.length === request.moveHistory.length);
      const original = mode === 'tenuki' ? state().currentNode : node!;
      expect(original).toBeDefined();
      const expected = repetitionHistoryForNode(original, 'aga')!;
      if (mode === 'tenuki') expected.push(situationalKey(request.board, request.currentPlayer));
      expect(request.repetitionHistory).toEqual([...new Set(expected)].sort());
    }
  });
});
