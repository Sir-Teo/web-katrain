import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CandidateMove } from '../src/types';

const analyzeMock = vi.fn();

vi.mock('../src/engine/katago/client', () => ({
  getKataGoEngineClient: () => ({
    analyze: analyzeMock,
    getEngineInfo: () => ({ backend: 'test', modelName: 'test-model' }),
  }),
  isKataGoCanceledError: () => false,
}));

const candidate = (x: number, y: number, order: number, pointsLost: number, scoreLead: number): CandidateMove => ({
  x, y, winRate: 0.9, scoreLead, visits: 50, pointsLost, order, prior: 0.1,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('an engine strategy when the top move is pass', () => {
  for (const strategy of ['jigo', 'scoreloss'] as const) {
    it(`${strategy} passes rather than giving points away`, async () => {
      analyzeMock.mockReset();
      // Black is 5.5 ahead and the game is over. Filling its own territory
      // with D16 would bring the score to 0.5 -- "closer to jigo".
      analyzeMock.mockResolvedValue({
        rootWinRate: 0.9,
        rootScoreLead: 5.5,
        rootScoreSelfplay: 5.5,
        rootScoreStdev: 0,
        rootVisits: 100,
        moves: [candidate(-1, -1, 0, 0, 5.5), candidate(3, 3, 1, 5, 0.5)],
        ownership: new Float32Array(19 * 19),
        ownershipStdev: new Float32Array(19 * 19),
        policy: new Float32Array(19 * 19 + 1),
      });
      const { useGameStore } = await import('../src/store/gameStore');
      useGameStore.getState().resetGame();
      useGameStore.setState((state) => ({
        isAiPlaying: true,
        aiColor: 'black',
        settings: { ...state.settings, aiStrategy: strategy, aiScoreLossStrength: 0, aiJigoTargetScore: 0.5 },
      }));
      // With strength 0 every candidate weighs the same; take the last.
      vi.spyOn(Math, 'random').mockReturnValue(0.99);

      useGameStore.getState().makeAiMove();
      await vi.waitFor(() => expect(useGameStore.getState().currentNode.move).not.toBeNull());

      expect(useGameStore.getState().currentNode.move).toMatchObject({ x: -1, y: -1 });
    });
  }
});
