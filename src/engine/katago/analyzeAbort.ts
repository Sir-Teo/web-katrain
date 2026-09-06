export type AnalysisGroup = 'interactive' | 'background';

/**
 * Whether an analyze request should give up its turn on the engine.
 *
 * Two reasons, and both have to be read live. A request is stale once a newer
 * one arrives in its own group. And a background request yields to an
 * interactive one, because interactive is the person waiting at the screen
 * while background is the app reading ahead on its own.
 *
 * The second half used to be a boolean computed once, when the handler started.
 * That made it true only for a request still sitting in the queue -- and the
 * request that actually holds the queue up is the one already searching, which
 * read a value frozen at false and ran to its limit. That limit is
 * ENGINE_MAX_TIME_MS: five minutes. `shouldAbort` is handed to `MctsSearch.run`
 * and polled during the search, so reading both values live is what lets a
 * click on Analyze take the engine back.
 */
export function createAnalyzeAbortCheck(args: {
  analysisGroup: AnalysisGroup;
  requestId: number;
  /** The interactive counter as it stood when this request was enqueued. */
  interactiveTokenAtEnqueue: number;
  /** Newest request id seen for this request's group, read at call time. */
  latestIdForGroup: () => number | undefined;
  /** The interactive counter, read at call time. */
  currentInteractiveToken: () => number;
}): () => boolean {
  const { analysisGroup, requestId, interactiveTokenAtEnqueue } = args;
  return () => {
    if (args.latestIdForGroup() !== requestId) return true;
    if (analysisGroup === 'interactive') return false;
    return args.currentInteractiveToken() !== interactiveTokenAtEnqueue;
  };
}
