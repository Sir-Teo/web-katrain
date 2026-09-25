import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AnalysisResult } from '../src/types';

const analyzeMock = vi.fn();
vi.mock('../src/engine/katago/client', () => ({
  getKataGoEngineClient: () => ({
    analyze: analyzeMock,
    getEngineInfo: () => ({ backend: 'test', modelName: 'test-model' }),
  }),
  isKataGoCanceledError: () => false,
}));

const mv = (x: number, y: number) => ({ x, y, winRate: 0.5, scoreLead: 0, visits: 16, pointsLost: 0, order: 0, prior: 1 });
const payload = (moves: unknown[], rootScoreLead = 0) => ({
  rootWinRate: 0.5, rootScoreLead, rootScoreSelfplay: 0, rootScoreStdev: 0, rootVisits: 16,
  moves, ownership: new Float32Array(361), ownershipStdev: new Float32Array(361), policy: new Float32Array(362),
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fakeAnalysis = (lead: number): AnalysisResult => ({ rootWinRate: 0.5, rootScoreLead: lead, moves: [mv(9, 9)], territory: [] });

describe('the play-elsewhere readout after a board edit', () => {
  beforeEach(() => analyzeMock.mockReset());

  it('is not left on Checking... when an edit cancels the request', async () => {
    const { useGameStore } = await import('../src/store/gameStore');
    const { summarizeTenukiRow } = await import('../src/utils/tenukiValue');
    analyzeMock.mockImplementation(async () => { await sleep(200); return payload([mv(3, 3)], -5); });
    const s = useGameStore.getState();
    s.resetGame();
    s.playMove(15, 15);
    const node = useGameStore.getState().currentNode;
    node.analysis = fakeAnalysis(0);
    useGameStore.getState().analyzeTenuki();
    expect(useGameStore.getState().tenukiAnalysis?.status).toBe('running');
    useGameStore.getState().applySetupStones([{ x: 0, y: 0, player: 'black' }]);
    await sleep(500);
    // position re-analysed later
    useGameStore.getState().currentNode.analysis = fakeAnalysis(0);
    const t = useGameStore.getState().tenukiAnalysis;
    const row = summarizeTenukiRow({ tenuki: t?.nodeId === node.id ? t : null, hasAnalysis: true, formatPoint: (x, y) => `${x},${y}` });

    expect(row.disabled).toBe(false);
  });

  it('drops a finished price once the edit changes the stones', async () => {
    const { useGameStore } = await import('../src/store/gameStore');
    analyzeMock.mockImplementation(async () => payload([mv(3, 3)], -5));
    const s = useGameStore.getState();
    s.resetGame();
    s.playMove(15, 15);
    const node = useGameStore.getState().currentNode;
    node.analysis = fakeAnalysis(0);
    useGameStore.getState().analyzeTenuki();
    await sleep(100);
    expect(useGameStore.getState().tenukiAnalysis?.status).toBe('ready');
    // put a stone on the point the "opponent takes"
    useGameStore.getState().applySetupStones([{ x: 3, y: 3, player: 'white' }]);
    const t = useGameStore.getState().tenukiAnalysis;

    expect(t?.nodeId === useGameStore.getState().currentNode.id && t?.status === 'ready').toBe(false);
  });
});
