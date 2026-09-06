import { describe, expect, it } from 'vitest';
import { createAnalyzeAbortCheck } from '../src/engine/katago/analyzeAbort';

/**
 * The worker runs one request at a time on a promise chain, so the request that
 * blocks everyone is the one already searching. `shouldAbort` is handed to
 * `MctsSearch.run` and polled during the search; whatever it reads has to be
 * read at call time, not captured when the handler started.
 */
describe('analyze abort check', () => {
  const make = (over: Partial<Parameters<typeof createAnalyzeAbortCheck>[0]> = {}) => {
    const state = { latest: 7 as number | undefined, token: 3 };
    const abort = createAnalyzeAbortCheck({
      analysisGroup: 'background',
      requestId: 7,
      interactiveTokenAtEnqueue: 3,
      latestIdForGroup: () => state.latest,
      currentInteractiveToken: () => state.token,
      ...over,
    });
    return { abort, state };
  };

  it('keeps going while it is still the newest of its group', () => {
    const { abort } = make();
    expect(abort()).toBe(false);
  });

  it('gives up once a newer request arrives in its own group', () => {
    const { abort, state } = make();
    expect(abort()).toBe(false);
    state.latest = 8;
    expect(abort()).toBe(true);
  });

  /**
   * The regression. This used to be a `const` evaluated when the handler
   * started, so a background search already running could never see the
   * interactive request that arrived behind it and ran on to
   * ENGINE_MAX_TIME_MS -- five minutes of someone waiting after clicking
   * Analyze.
   */
  it('hands the engine over when an interactive request arrives mid-search', () => {
    const { abort, state } = make();
    expect(abort()).toBe(false);
    state.token = 4; // the click on Analyze, after this search began
    expect(abort()).toBe(true);
  });

  it('does not let one interactive request preempt another', () => {
    // Interactive requests supersede each other by id, through the group's
    // newest-wins rule; the token is only how background yields to them.
    const { abort, state } = make({ analysisGroup: 'interactive' });
    state.token = 99;
    expect(abort()).toBe(false);
    state.latest = 8;
    expect(abort()).toBe(true);
  });

  it('gives up when its group has no newest id at all', () => {
    const { abort, state } = make();
    state.latest = undefined;
    expect(abort()).toBe(true);
  });
});
