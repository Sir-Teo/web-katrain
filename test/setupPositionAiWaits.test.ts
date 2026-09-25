import { describe, expect, it, vi, beforeEach } from 'vitest';

const analyzeMock = vi.fn();
vi.mock('../src/engine/katago/client', () => ({
  getKataGoEngineClient: () => ({
    analyze: analyzeMock,
    getEngineInfo: () => ({ backend: 'test', modelName: 'test-model' }),
  }),
  isKataGoCanceledError: () => false,
}));

const mv = (x: number, y: number, extra: Record<string, unknown> = {}) => ({
  x, y, winRate: 0.5, scoreLead: 0, visits: 16, pointsLost: 0, order: 0, prior: 1, ...extra,
});
const payload = (moves: unknown[], rootScoreLead = 0) => ({
  rootWinRate: 0.5, rootScoreLead, rootScoreSelfplay: 0, rootScoreStdev: 0, rootVisits: 16,
  moves, ownership: new Float32Array(361), ownershipStdev: new Float32Array(361), policy: new Float32Array(362),
});
const waitFor = async (pred: () => boolean, ms = 20000) => {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('generating a set-up position with an AI opponent', () => {
  beforeEach(() => analyzeMock.mockReset());
  it.each([false, true])('the opponent waits while the engine plays both sides (analysis mode %s)', async (analysisMode) => {
    const { useGameStore } = await import('../src/store/gameStore');
    
    analyzeMock.mockImplementation(async (args?: { moveHistory: unknown[]; wideRootNoise?: number; analysisGroup?: string }) => {
      if (!args) return payload([mv(-1, -1)]);
      const n = args.moveHistory.length;
      const isSetup = args.wideRootNoise === 0.03;

      // setup moves on row 0, anything else on row 10
      await sleep(isSetup ? 700 : 100);
      return payload([mv(n, isSetup ? 0 : 10)]);
    });
    const s = useGameStore.getState();
    s.resetGame();
    useGameStore.setState({ isAnalysisMode: analysisMode });
    s.startNewGame({ komi: 6.5, rules: 'japanese', boardSize: 19, handicap: 0 });
    // Same order as Layout's NewGameModal onStart.
    useGameStore.getState().generateSetupPosition({ untilMove: 8, targetAdvantage: 0 });
    useGameStore.setState({ isAiPlaying: true, aiColor: 'white' });
    await waitFor(() => useGameStore.getState().setupPositionProgress === null);
    const st = useGameStore.getState();

    expect(st.moveHistory.every((m) => m.y === 0)).toBe(true);
  }, 30000);
});
