import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { analysisQueue, AnalysisQueueCanceledError } from '../src/utils/analysisQueue';

const analyzeMock = vi.fn();
vi.mock('../src/engine/katago/client', () => ({
  getKataGoEngineClient: () => ({
    analyze: analyzeMock,
    getEngineInfo: () => ({ backend: 'wasm', modelName: 'test-model', backendNote: null }),
  }),
  isKataGoCanceledError: () => false,
}));

const answer = {
  rootWinRate: 0.5, rootScoreLead: 0, rootScoreSelfplay: 0, rootScoreStdev: 0, rootVisits: 16,
  moves: [{ x: 3, y: 3, winRate: 0.5, scoreLead: 0, visits: 16, pointsLost: 0, order: 0, prior: 1 }],
  ownership: new Float32Array(361), ownershipStdev: new Float32Array(361), policy: new Float32Array(362),
};
type Pending = { resolve: (value: typeof answer) => void; reject: (error: Error) => void };
let pending: Pending[];
const flush = () => vi.advanceTimersByTimeAsync(0);
const state = () => useGameStore.getState();

describe('AI request ownership and cancellation', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    state().resetGame();
    await flush();
    useGameStore.setState({ isAnalysisMode: false, isTeachMode: false, isAiPlaying: false, isAiThinking: false, aiColor: null });
    state().updateSettings({ soundEnabled: false, aiStrategy: 'default' });
    pending = [];
    analyzeMock.mockReset().mockImplementation((request) => new Promise((resolve, reject) => {
      pending.push({ resolve, reject });
      request.signal.addAbortListener(() => reject(new AnalysisQueueCanceledError()));
    }));
  });

  afterEach(async () => {
    state().resetGame();
    await flush();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('stops an active forced move, ignores its late answer, and permits a fresh request', async () => {
    state().makeAiMove({ force: true });
    const signal = analyzeMock.mock.calls[0]![0].signal;
    state().analyzeExtra('stop');
    expect(signal.aborted).toBe(true);
    expect(state().isAiThinking).toBe(false);
    pending[0]!.resolve(answer);
    await vi.advanceTimersByTimeAsync(500);
    expect(analyzeMock).toHaveBeenCalledTimes(1);
    expect(state().moveHistory).toHaveLength(0);
    state().makeAiMove({ force: true });
    pending[1]!.resolve(answer);
    await flush();
    expect(state().moveHistory).toHaveLength(1);
    expect(state().isAiThinking).toBe(false);
  });

  it('does not let a superseded request retry or clear its replacement’s thinking indicator', async () => {
    state().makeAiMove({ force: true });
    state().makeAiMove({ force: true });
    await vi.advanceTimersByTimeAsync(200);
    expect(analyzeMock).toHaveBeenCalledTimes(2);
    expect(analyzeMock.mock.calls[1]![0].signal.aborted).toBe(false);
    expect(state().isAiThinking).toBe(true);
    pending[1]!.resolve(answer);
    await flush();
    expect(state().moveHistory).toHaveLength(1);
  });

  it('removes an obsolete queued move even when its replacement is for the other color', async () => {
    let finishInteractive!: () => void;
    const interactive = analysisQueue.enqueue({ group: 'interactive', priority: 100, preempt: true,
      run: () => new Promise<void>((resolve) => { finishInteractive = resolve; }),
    });
    try {
      state().makeAiMove({ force: true });
      state().playMove(0, 0);
      state().makeAiMove({ force: true });
      expect(analysisQueue.getSnapshot().pending.filter(job => job.group === 'ai-move')).toHaveLength(1);
    } finally {
      finishInteractive();
      await interactive;
      await flush();
    }
    expect(analyzeMock).toHaveBeenCalledTimes(1);
    expect(analyzeMock.mock.calls[0]![0].currentPlayer).toBe('white');
    pending[0]!.resolve(answer);
    await flush();
    expect(state().moveHistory).toHaveLength(2);
    expect(state().isAiThinking).toBe(false);
  });

  it.each(['move', 'existing move', 'pass', 'existing pass', 'opponent toggle'] as const)(
    'cancels a delayed automatic reply after %s', async (action) => {
      if (action === 'existing move') { state().playMove(0, 0); state().navigateBack(); }
      if (action === 'existing pass') { state().passTurn(); state().navigateBack(); }
      if (action === 'opponent toggle') state().toggleAi('black');
      else {
        useGameStore.setState({ isAiPlaying: true, aiColor: 'white' });
        if (action.includes('pass')) state().passTurn(); else state().playMove(0, 0);
      }
      expect(analyzeMock).not.toHaveBeenCalled();
      state().analyzeExtra('stop');
      await vi.advanceTimersByTimeAsync(1000);
      expect(analyzeMock).not.toHaveBeenCalled();
      state().makeAiMove();
      expect(analyzeMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['clear cache', 'resign', 'disable opponent'] as const)('does not resurrect an AI request after %s', async (action) => {
    if (action === 'disable opponent') useGameStore.setState({ isAiPlaying: true, aiColor: 'black' });
    state().makeAiMove({ force: true });
    if (action === 'clear cache') state().clearAnalysisCache();
    else if (action === 'resign') state().resign();
    else state().toggleAi('black');
    expect(analyzeMock.mock.calls[0]![0].signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(analyzeMock).toHaveBeenCalledTimes(1);
    expect(state().moveHistory).toHaveLength(0);
    expect(state().isAiThinking).toBe(false);
  });

  it('cancels a retry that was scheduled before Stop', async () => {
    state().makeAiMove({ force: true });
    pending[0]!.reject(new AnalysisQueueCanceledError());
    await flush();
    expect(state().isAiThinking).toBe(true);
    state().analyzeExtra('stop');
    await vi.advanceTimersByTimeAsync(500);
    expect(analyzeMock).toHaveBeenCalledTimes(1);
    expect(state().isAiThinking).toBe(false);
  });

  it.each(['move', 'setup edit'] as const)('clears a pending retry when a %s replaces its position', async (action) => {
    state().makeAiMove({ force: true });
    pending[0]!.reject(new AnalysisQueueCanceledError());
    await flush();
    expect(state().isAiThinking).toBe(true);
    if (action === 'move') state().playMove(0, 0);
    else state().applySetupStones([{ x: 0, y: 0, player: 'black' }]);
    const current = state().currentNode;
    await vi.advanceTimersByTimeAsync(500);
    expect(analyzeMock).toHaveBeenCalledTimes(1);
    expect(state().currentNode).toBe(current);
    expect(state().isAiThinking).toBe(false);
  });

  it('still resumes the current AI turn after a higher-priority analysis preempts it', async () => {
    state().makeAiMove({ force: true });
    await analysisQueue.enqueue({ group: 'interactive', priority: 100, preempt: true, run: async () => null });
    await vi.advanceTimersByTimeAsync(150);
    expect(analyzeMock).toHaveBeenCalledTimes(2);
    pending[1]!.resolve(answer);
    await flush();
    expect(state().moveHistory).toHaveLength(1);
  });

  it('retries with the new model after a settings change cancels its analysis', async () => {
    state().makeAiMove({ force: true });
    state().updateSettings({ katagoModelUrl: '/models/new-model.bin.gz' });
    await vi.advanceTimersByTimeAsync(150);
    expect(analyzeMock).toHaveBeenCalledTimes(2);
    expect(analyzeMock.mock.calls[1]![0].modelUrl).toContain('/models/new-model.bin.gz');
    pending[1]!.resolve(answer);
    await flush();
    expect(state().moveHistory).toHaveLength(1);
  });

  it('does not play a heuristic fallback on a position reached while the engine was pending', async () => {
    state().makeAiMove({ force: true });
    state().playMove(0, 0);
    const current = state().currentNode;
    pending[0]!.reject(new Error('Engine failed'));
    await flush();
    expect(state().currentNode).toBe(current);
    expect(state().moveHistory).toHaveLength(1);
  });

  it('does not apply a result after setup edits change the same node', async () => {
    const nodeId = state().currentNode.id;
    state().makeAiMove({ force: true });
    state().applySetupStones([{ x: 0, y: 0, player: 'black' }]);
    expect(state().currentNode.id).toBe(nodeId);
    pending[0]!.resolve(answer);
    await flush();
    expect(state().moveHistory).toHaveLength(0);
    expect(state().board[0]![0]).toBe('black');
  });
});
