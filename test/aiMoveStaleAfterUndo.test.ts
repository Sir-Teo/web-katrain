import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CandidateMove } from '../src/types';

const analyzeMock = vi.fn();

vi.mock('../src/engine/katago/client', () => ({
  getKataGoEngineClient: () => ({
    analyze: analyzeMock,
    getEngineInfo: () => ({ backend: 'test', modelName: 'test-model' }),
  }),
  isKataGoCanceledError: () => false,
}));

const SIZE = 9;

/** A real point, so an unguarded result would visibly land on the board. */
const candidate = (x: number, y: number): CandidateMove => ({
  x,
  y,
  winRate: 0.5,
  scoreLead: 0,
  visits: 32,
  pointsLost: 0,
  order: 0,
  prior: 1,
});

const analysisPayload = (move: CandidateMove) => ({
  rootWinRate: 0.5,
  rootScoreLead: 0,
  rootScoreSelfplay: 0,
  rootScoreStdev: 0,
  rootVisits: 32,
  moves: [move],
  ownership: new Float32Array(SIZE * SIZE),
  ownershipStdev: new Float32Array(SIZE * SIZE),
  policy: new Float32Array(SIZE * SIZE + 1),
});

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

/** `playMove` schedules the bot's turn 500ms out, so the search starts late. */
const waitForBotToStartThinking = async () => {
  await new Promise((resolve) => setTimeout(resolve, 700));
  await flush();
};

/**
 * The bot thinks for as long as its settings allow, and the person does not
 * have to wait for it. If they take the move back while it is still searching,
 * the reply that eventually arrives belongs to a position that is no longer on
 * the board -- and playing it would drop a phantom stone into the game.
 *
 * `makeAiMove` re-reads the store when the search returns and drops the result
 * unless the node, the player to move and the bot's colour are all still what
 * they were when it started. Verified in a browser at 4000 visits: undoing
 * mid-search left an empty board twenty-two seconds later.
 */
describe('a bot move that arrives after an undo', () => {
  beforeEach(() => {
    analyzeMock.mockReset();
  });

  it('is dropped rather than played onto the position the person went back to', async () => {
    const { useGameStore } = await import('../src/store/gameStore');
    const store = () => useGameStore.getState();

    let release!: (value: unknown) => void;
    analyzeMock.mockReturnValue(new Promise((resolve) => { release = resolve; }));

    store().resetGame();
    store().startNewGame({ boardSize: SIZE, komi: 7, rules: 'japanese', handicap: 0 });
    store().toggleAi('white');
    expect(store().aiColor).toBe('white');

    store().playMove(2, 2);
    await waitForBotToStartThinking();
    expect(store().moveHistory.length, 'the human move is on the board').toBe(1);
    // Without this the rest of the test proves nothing: an assertion that no
    // stale move landed passes trivially when the bot never searched at all.
    expect(analyzeMock, 'the bot never started searching').toHaveBeenCalled();

    // Taken back while the bot is still searching.
    store().undoMove();
    await flush();
    expect(store().moveHistory.length, 'the undo landed').toBe(0);

    // The search returns, answering a position that is no longer current.
    release(analysisPayload(candidate(6, 6)));
    await flush();

    expect(store().moveHistory.length, 'a stale bot move was played').toBe(0);
    expect(store().board.flat().filter(Boolean).length, 'a phantom stone reached the board').toBe(0);
    expect(store().currentPlayer, 'the turn moved on without a move').toBe('black');
  });
});
