import { beforeEach, describe, expect, it, vi } from 'vitest';

const analyzeMock = vi.fn();
vi.mock('../src/engine/katago/client', () => ({
  getKataGoEngineClient: () => ({
    analyze: analyzeMock,
    getEngineInfo: () => ({ backend: 'test', modelName: 'test-model' }),
  }),
  isKataGoCanceledError: () => false,
}));

const mv = (x: number, y: number) => ({ x, y, winRate: 0.5, scoreLead: 0, visits: 16, pointsLost: 0, order: 0, prior: 1 });
const payload = (moves: unknown[]) => ({
  rootWinRate: 0.5, rootScoreLead: 0, rootScoreSelfplay: 0, rootScoreStdev: 0, rootVisits: 16,
  moves, ownership: new Float32Array(361), ownershipStdev: new Float32Array(361), policy: new Float32Array(362),
});
const waitFor = async (pred: () => boolean, ms = 8000) => {
  const started = Date.now();
  while (!pred()) {
    if (Date.now() - started > ms) throw new Error('timeout');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

describe('play to end over a game that already has moves', () => {
  beforeEach(() => analyzeMock.mockReset());

  it('folds only the moves it added, never the real game it walked through', async () => {
    const { useGameStore } = await import('../src/store/gameStore');
    const s = useGameStore.getState();
    s.resetGame();
    s.playMove(3, 3); s.playMove(15, 15); s.playMove(3, 15); s.playMove(15, 3);
    const start = useGameStore.getState().rootNode.children[0]!.children[0]!;
    const realMove3 = start.children[0]!;
    useGameStore.getState().jumpToNode(start);
    analyzeMock.mockImplementation(async (args?: { moveHistory: unknown[] }) => {
      if (!args) return payload([mv(-1, -1)]);
      const n = args.moveHistory.length;
      if (n === 2) return payload([mv(3, 15)]); // the game's own move 3
      if (n === 3) return payload([mv(10, 10)]);
      return payload([mv(-1, -1)]);
    });

    useGameStore.getState().selfplayToEnd();
    await waitFor(() => !useGameStore.getState().isSelfplayToEnd);
    const state = useGameStore.getState();

    expect(realMove3.collapsed).not.toBe(true);
    const playout = realMove3.children.find((child) => child.move?.x === 10 && child.move?.y === 10)!;
    expect(playout.collapsed).toBe(true);
    expect(state.notification?.message).toContain('Played out 3 moves');
    expect(state.currentNode.id).toBe(start.id);
  });
});
