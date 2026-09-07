import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CandidateMove, GameNode } from '../src/types';

const analyzeMock = vi.fn();
vi.mock('../src/engine/katago/client', () => ({
  getKataGoEngineClient: () => ({
    analyze: analyzeMock,
    getEngineInfo: () => ({ backend: 'test', modelName: 'test-model' }),
  }),
  isKataGoCanceledError: () => false,
}));

const SIZE = 9;
/** Marks the answer computed for the world as it was before the disturbance. */
const STALE_MARKER = -999;

const candidate: CandidateMove =
  { x: 6, y: 6, winRate: 0.5, scoreLead: 0, visits: 32, pointsLost: 0, order: 0, prior: 1 };

const payload = (marker: number) => ({
  rootWinRate: 0.5,
  rootScoreLead: marker,
  rootScoreSelfplay: 0,
  rootScoreStdev: 0,
  rootVisits: 32,
  moves: [candidate],
  ownership: new Float32Array(SIZE * SIZE),
  ownershipStdev: new Float32Array(SIZE * SIZE),
  policy: new Float32Array(SIZE * SIZE + 1),
  territory: Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => 0)),
});

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 30));
};

const walk = (node: GameNode, acc: GameNode[] = []): GameNode[] => {
  acc.push(node);
  (node.children ?? []).forEach((child) => walk(child, acc));
  return acc;
};

/**
 * A search runs for as long as its settings allow, and nothing stops the person
 * changing the world while it does. Whatever comes back then describes a
 * position that may no longer be anywhere -- and writing it onto whatever node
 * happens to be current is how an analysis ends up describing a board nobody is
 * looking at.
 *
 * The rule is the same for every disturbance: a result may only ever land on the
 * node it was computed for, and not even there once the stones under that node
 * have changed. Navigating away is the one case where it still lands, which is
 * right -- the answer is still true for the position it was asked about, and the
 * person keeps the analysis they waited for.
 *
 * Three layers enforce this and no single one is load-bearing everywhere: the
 * queue drops superseded jobs by stale key, `updateSettings` cancels everything
 * outright when a setting that changes an answer moves, and `applyAnalysis`
 * compares the node's position key against the key the request was made with.
 * Disabling all three leaves only the komi and rules cases failing -- the rest
 * hold structurally, because those disturbances build a new tree and the node
 * the result was aimed at is no longer in it. They are kept so that a refactor
 * which makes them non-structural, by reusing node identities across a reset for
 * instance, does not pass unnoticed.
 */
describe('an engine result returning to a world that moved on', () => {
  beforeEach(() => {
    analyzeMock.mockReset();
  });

  type Store = () => ReturnType<
    typeof import('../src/store/gameStore')['useGameStore']['getState']
  >;

  const race = async (disturb: (store: Store) => void) => {
    const { useGameStore } = await import('../src/store/gameStore');
    const store = () => useGameStore.getState();

    const pending: Array<(value: unknown) => void> = [];
    analyzeMock.mockImplementation(() => new Promise((resolve) => { pending.push(resolve); }));

    store().resetGame();
    store().startNewGame({ boardSize: SIZE, komi: 7, rules: 'japanese', handicap: 0 });
    store().playMove(2, 2);
    store().playMove(6, 6);
    if (!store().isAnalysisMode) store().toggleAnalysisMode();
    await flush();

    const nodeBefore = store().currentNode.id;
    analyzeMock.mockClear();
    pending.length = 0;

    void store().runAnalysis({ force: true, visits: 100 });
    await flush();
    // Without this the assertions below pass on a search that never happened.
    expect(analyzeMock, 'the search never started').toHaveBeenCalled();

    const staleCount = pending.length;
    disturb(store);
    await flush();

    pending.slice(0, staleCount).forEach((resolve) => resolve(payload(STALE_MARKER)));
    pending.slice(staleCount).forEach((resolve) => resolve(payload(0)));
    await flush();

    const stale = walk(store().rootNode).filter(
      (node) => node.analysis && node.analysis.rootScoreLead === STALE_MARKER
    );
    return { nodeBefore, stale };
  };

  it('keeps the answer when the person only navigated away from it', async () => {
    const { nodeBefore, stale } = await race((store) => store().navigateBack());
    // It may survive, but only on the node it was actually computed for.
    expect(stale.map((node) => node.id)).toEqual([nodeBefore]);
  });

  it.each([
    ['a new game starts', (store: Store) => store().startNewGame({ boardSize: SIZE, komi: 7, rules: 'japanese', handicap: 0 })],
    ['the board size changes', (store: Store) => store().startNewGame({ boardSize: 19, komi: 7, rules: 'japanese', handicap: 0 })],
    ['the komi changes', (store: Store) => store().setKomi(0.5)],
    ['the rules change', (store: Store) => store().updateSettings({ gameRules: 'chinese' })],
    ['the stones under the node are edited', (store: Store) => store().applySetupStones([
      { x: 0, y: 0, player: 'black' },
      { x: 8, y: 8, player: 'white' },
    ])],
    ['the game is reset', (store: Store) => store().resetGame()],
  ])('drops it when %s', async (_name, disturb) => {
    const { stale } = await race(disturb);
    expect(stale.map((node) => node.id), 'a stale analysis reached the tree').toEqual([]);
  });
});
