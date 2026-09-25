import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameNode } from '../src/types';
import { waitFor, payload } from './helpers/analysisRaceHelpers';

const analyzeMock = vi.fn();
vi.mock('../src/engine/katago/client', () => ({
  getKataGoEngineClient: () => ({
    analyze: analyzeMock,
    evaluateBatch: vi.fn(),
    getEngineInfo: () => ({ backend: 'test', modelName: 'm', backendNote: null }),
  }),
  isKataGoCanceledError: () => false,
}));

describe('setup edit during a game review', () => {
  beforeEach(async () => {
    analyzeMock.mockReset();
    const { analysisQueue } = await import('../src/utils/analysisQueue');
    const { useGameStore } = await import('../src/store/gameStore');
    analysisQueue.cancelWhere(() => true, 'reset');
    analysisQueue.clearCache();
    useGameStore.getState().resetGame();
  });

  it('drops the pre-edit position\'s result and analyses the edited one', async () => {
    const { useGameStore } = await import('../src/store/gameStore');
    const held: Array<{ args: { board: (string | null)[][]; positionId: string }; r: (v: unknown) => void }> = [];
    analyzeMock.mockImplementation((args: { board: (string | null)[][]; positionId: string }) => new Promise((r) => held.push({ args, r })));

    const s = useGameStore.getState();
    s.playMove(3, 3);
    s.playMove(15, 15);
    useGameStore.getState().startFullGameAnalysis({ visits: 500 });
    await waitFor(() => held.length === 1);
    const target = (function find(n: GameNode): GameNode | null { if (n.id === held[0]!.args.positionId) return n; for (const c of n.children) { const f = find(c); if (f) return f; } return null; })(useGameStore.getState().rootNode)!;
    useGameStore.getState().jumpToNode(target);
    expect(held[0]!.args.board[10]![10]).toBeNull(); // request is for the empty board

    // User adds a black setup stone at the root while that request is in flight.
    useGameStore.getState().setEditTool('setup-black');
    useGameStore.getState().applyEditTool(10, 10);
    const root = target;
    expect(root.gameState.board[10]![10]).toBe('black'); expect(useGameStore.getState().currentNode).toBe(target);
    expect(root.analysis).toBeNull(); // the edit cleared it

    held[0]!.r(payload({ rootVisits: 500, rootScoreLead: -7 })); // result for the OLD (empty) board
    // Answer every later request with the edited board's own reading.
    let answered = 1;
    for (let guard = 0; guard < 20 && useGameStore.getState().isGameAnalysisRunning; guard++) {
      await waitFor(() => held.length > answered || !useGameStore.getState().isGameAnalysisRunning);
      while (answered < held.length) held[answered++]!.r(payload({ rootVisits: 500, rootScoreLead: 3 }));
    }
    await waitFor(() => !useGameStore.getState().isGameAnalysisRunning);

    // The stale reading is dropped and the edited position asked about again.
    expect(root.analysis?.rootScoreLead).toBe(3);
    const reasked = held.slice(1).find((h) => h.args.positionId === root.id);
    expect(reasked?.args.board[10]![10]).toBe('black');
  });
});
