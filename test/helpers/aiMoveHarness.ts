import { vi } from 'vitest';
import { useGameStore } from '../../src/store/gameStore';
import { analysisQueue } from '../../src/utils/analysisQueue';


export type Mv = { x: number; y: number; scoreLead?: number; pointsLost?: number; visits?: number; ownership?: Float32Array };

export function payload(opts: { size: number; policy?: Record<string, number>; pass?: number; moves?: Mv[]; rootScoreLead?: number }) {
  const { size } = opts;
  let policy: Float32Array | undefined;
  if (opts.policy) {
    policy = new Float32Array(size * size + 1).fill(-1);
    for (const [k, v] of Object.entries(opts.policy)) {
      const [x, y] = k.split(',').map(Number);
      policy[y! * size + x!] = v;
    }
    policy[size * size] = opts.pass ?? 0;
  }
  const moves = (opts.moves ?? []).map((m, i) => ({
    x: m.x, y: m.y, winRate: 0.5, winRateLost: 0, scoreLead: m.scoreLead ?? 0, scoreSelfplay: 0, scoreStdev: 0,
    visits: m.visits ?? 100, pointsLost: m.pointsLost ?? 0, relativePointsLost: 0, order: i, prior: 0.1, pv: [],
    ownership: m.ownership,
  }));
  return {
    rootWinRate: 0.5, rootScoreLead: opts.rootScoreLead ?? 0, rootScoreSelfplay: 0, rootScoreStdev: 0, rootVisits: 100,
    ownership: new Float32Array(size * size), moves, policy,
  };
}

export async function runAi(analyzeMock: ReturnType<typeof vi.fn>, settings: Record<string, unknown>, resp: unknown): Promise<{ x: number; y: number } | null> {
  analysisQueue.clearCache();
  analyzeMock.mockReset().mockResolvedValue(resp);
  const before = useGameStore.getState().currentNode;
  useGameStore.getState().updateSettings(settings as never);
  useGameStore.getState().makeAiMove({ force: true });
  for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(50);
  const after = useGameStore.getState().currentNode;
  if (after === before) return null;
  const mv = after.move!;
  // go back so the next run starts from the same position
  useGameStore.getState().navigateBack();
  return { x: mv.x, y: mv.y };
}
