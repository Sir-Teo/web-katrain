import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { analysisQueue } from '../src/utils/analysisQueue';
import type { KataGoAnalysisPayload } from '../src/engine/katago/types';
import type { getKataGoEngineClient } from '../src/engine/katago/client';
type KataGoAnalyzeArgs = Parameters<ReturnType<typeof getKataGoEngineClient>['analyze']>[0];

const analyzeMock = vi.fn();
vi.mock('../src/engine/katago/client', () => ({
  getKataGoEngineClient: () => ({
    analyze: analyzeMock,
    getEngineInfo: () => ({ backend: 'wasm', modelName: 'test-model', backendNote: null }),
  }),
  isKataGoCanceledError: () => false,
}));

const state = useGameStore.getState;
const payload = (visits = 100, score = 1): KataGoAnalysisPayload => ({
  rootWinRate: 0.5, rootScoreLead: score, rootScoreSelfplay: score, rootScoreStdev: 0,
  rootVisits: visits, ownership: new Float32Array(361), moves: [],
  ownershipStdev: new Float32Array(361), policy: new Float32Array(362),
});
const held: Array<{ args: KataGoAnalyzeArgs; resolve: (value: KataGoAnalysisPayload) => void; reject: (error: Error) => void }> = [];
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

beforeEach(() => {
  vi.useFakeTimers();
  state().stopAnalysis();
  analysisQueue.cancelWhere(() => true);
  analysisQueue.clearCache();
  useGameStore.setState({ isAnalysisMode: false, isTeachMode: false, isAiPlaying: false });
  state().resetGame();
  state().updateSettings({ soundEnabled: false, gameRules: 'japanese', katagoVisits: 100, katagoFastVisits: 25, katagoOwnershipMode: 'root' });
  useGameStore.setState({ isAnalysisMode: true });
  held.length = 0;
  analyzeMock.mockReset().mockImplementation((args: KataGoAnalyzeArgs) => new Promise<KataGoAnalysisPayload>((resolve, reject) => {
    held.push({ args, resolve, reject });
  }));
});

afterEach(async () => {
  state().stopAnalysis();
  analysisQueue.cancelWhere(() => true);
  useGameStore.setState({ isAnalysisMode: false });
  for (const request of held) request.resolve(payload());
  await flush();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('interactive work shared by automatic analysis triggers', () => {
  it('shares identical requests, including progress, and applies completion once', async () => {
    const first = state().runAnalysis({ reportEveryMs: 10 });
    const second = state().runAnalysis({ reportEveryMs: 10 });
    expect(held).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    held[0]!.args.onProgress?.(payload(20));
    expect(state().analysisData?.rootVisits).toBe(20);
    const version = state().treeVersion;
    held[0]!.resolve(payload());
    await Promise.all([first, second]);
    expect(state().analysisData?.rootVisits).toBe(100);
    expect(state().treeVersion).toBe(version + 1);
  });

  it('lets the continuous loop deepen its first search without the layout restarting it', async () => {
    useGameStore.setState({ isAnalysisMode: false });
    state().toggleContinuousAnalysis(true);
    const layout = state().runAnalysis({ ifIdle: true });
    expect(held).toHaveLength(1);
    expect(held[0]!.args.visits).toBe(25);
    held[0]!.resolve(payload(25));
    await layout;
    await vi.advanceTimersByTimeAsync(51);
    expect(held).toHaveLength(2);
    expect(held[1]!.args.visits).toBe(50);
    expect(held[1]!.args.signal?.aborted).toBe(false);
    state().stopAnalysis();
    held[1]!.resolve(payload(50));
    await vi.advanceTimersByTimeAsync(1000);
    expect(held).toHaveLength(2);
    expect(state().analysisData?.rootVisits).toBe(25);
  });

  it('shares the phone toggle timer and layout effect', async () => {
    useGameStore.setState({ isAnalysisMode: false });
    state().toggleAnalysisMode();
    const layout = state().runAnalysis({ ifIdle: true });
    await vi.advanceTimersByTimeAsync(1);
    expect(held).toHaveLength(1);
    held[0]!.resolve(payload());
    await layout;
  });

  it('does not restart live analysis when the move timer catches up to the layout', async () => {
    const old = state().runAnalysis();
    state().playMove(3, 3);
    const layout = state().runAnalysis({ ifIdle: true });
    expect(held).toHaveLength(2);
    expect(held[1]!.args.board[3]![3]).toBe('black');
    await vi.advanceTimersByTimeAsync(501);
    expect(held).toHaveLength(2);
    expect(held[1]!.args.signal?.aborted).toBe(false);
    held[0]!.resolve(payload(100, 99));
    held[1]!.resolve(payload(100, 5));
    await Promise.all([old, layout]);
    expect(state().analysisData?.rootScoreLead).toBe(5);
  });

  it('shares a pending request but never rejoins it after Stop', async () => {
    let release!: () => void;
    const blocker = analysisQueue.enqueue({ group: 'test', priority: 1000, run: () => new Promise<void>(resolve => { release = resolve; }) });
    const first = state().runAnalysis();
    const shared = state().runAnalysis({ ifIdle: true });
    expect(analysisQueue.getSnapshot().pending).toHaveLength(1);
    let settled = false;
    void first.then(() => { settled = true; });
    await flush();
    expect(settled, 'The second trigger must not cancel the first pending caller').toBe(false);
    state().stopAnalysis();
    const fresh = state().runAnalysis({ ifIdle: true });
    expect(analysisQueue.getSnapshot().pending).toHaveLength(1);
    release();
    await blocker;
    await flush();
    expect(held).toHaveLength(1);
    held[0]!.resolve(payload());
    await Promise.all([first, shared, fresh]);
    expect(state().analysisData?.rootVisits).toBe(100);
  });

  it('keeps the replacement joinable after the canceled request finally settles', async () => {
    const old = state().runAnalysis();
    state().stopAnalysis();
    const fresh = state().runAnalysis();
    expect(held).toHaveLength(2);
    held[0]!.resolve(payload(100, 99));
    await old;
    const joined = state().runAnalysis({ ifIdle: true });
    expect(held).toHaveLength(2);
    held[1]!.resolve(payload(100, 2));
    await Promise.all([fresh, joined]);
    expect(state().analysisData?.rootScoreLead).toBe(2);
  });

  it('still replaces an identical request when the user explicitly forces it', async () => {
    const old = state().runAnalysis();
    const forced = state().runAnalysis({ force: true });
    expect(held).toHaveLength(2);
    expect(held[0]!.args.signal?.aborted).toBe(true);
    const joined = state().runAnalysis({ ifIdle: true });
    expect(held).toHaveLength(2);
    held[0]!.resolve(payload(100, 99));
    held[1]!.resolve(payload(100, 3));
    await Promise.all([old, forced, joined]);
    expect(state().analysisData?.rootScoreLead).toBe(3);
  });

  it.each([{ visits: 200 }, { reportEveryMs: 10 }])('honors an explicit changed request: %j', async opts => {
    const old = state().runAnalysis();
    const changed = state().runAnalysis(opts);
    expect(held).toHaveLength(2);
    expect(held[0]!.args.signal?.aborted).toBe(true);
    held[0]!.resolve(payload(100, 99));
    held[1]!.resolve(payload(200, 6));
    await Promise.all([old, changed]);
    expect(state().analysisData?.rootScoreLead).toBe(6);
  });

  it('retries after a shared request fails', async () => {
    const first = state().runAnalysis();
    const joined = state().runAnalysis({ ifIdle: true });
    expect(held).toHaveLength(1);
    held[0]!.reject(new Error('test engine failure'));
    await Promise.all([first, joined]);
    expect(state().engineError).toBe('test engine failure');
    const fresh = state().runAnalysis({ ifIdle: true });
    expect(held).toHaveLength(2);
    held[1]!.resolve(payload());
    await fresh;
    expect(state().engineError).toBeNull();
  });

  it.each(['position', 'rules', 'region', 'ownership'] as const)('replaces work when its %s changes', async change => {
    const old = state().runAnalysis();
    if (change === 'position') state().playMove(3, 3);
    if (change === 'rules') state().updateSettings({ gameRules: 'aga' });
    if (change === 'region') state().setRegionOfInterest({ xMin: 2, xMax: 3, yMin: 2, yMax: 3 });
    if (change === 'ownership') state().updateSettings({ katagoOwnershipMode: 'tree' });
    const fresh = state().runAnalysis({ ifIdle: true });
    expect(held).toHaveLength(2);
    expect(held[0]!.args.signal?.aborted).toBe(true);
    held[0]!.resolve(payload(100, 99));
    held[1]!.resolve(payload(100, 4));
    await Promise.all([old, fresh]);
    expect(state().analysisData?.rootScoreLead).toBe(4);
  });
});
