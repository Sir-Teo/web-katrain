import React from 'react';

type Subscribe = (onStoreChange: () => void) => () => void;
type Selector<S, T> = (snapshot: S) => T;
type EqualityFn<T> = (a: T, b: T) => boolean;

function useSyncExternalStoreWithSelector<S, T>(
  subscribe: Subscribe,
  getSnapshot: () => S,
  getServerSnapshot: (() => S) | undefined,
  selector: Selector<S, T>,
  isEqual?: EqualityFn<T>
): T {
  const memoRef = React.useRef<{
    hasMemo: boolean;
    snapshot?: S;
    selection?: T;
  }>({ hasMemo: false });

  const memoizedSelector = React.useCallback(
    (snapshot: S): T => {
      const memo = memoRef.current;
      if (!memo.hasMemo) {
        memo.hasMemo = true;
        memo.snapshot = snapshot;
        memo.selection = selector(snapshot);
        return memo.selection;
      }

      if (Object.is(snapshot, memo.snapshot)) {
        return memo.selection as T;
      }

      const nextSelection = selector(snapshot);
      if (isEqual && memo.selection !== undefined && isEqual(memo.selection, nextSelection)) {
        memo.snapshot = snapshot;
        return memo.selection;
      }

      memo.snapshot = snapshot;
      memo.selection = nextSelection;
      return nextSelection;
    },
    [isEqual, selector]
  );

  const getSelection = React.useCallback(() => memoizedSelector(getSnapshot()), [getSnapshot, memoizedSelector]);
  const getServerSelection = React.useCallback(
    () => memoizedSelector(getServerSnapshot ? getServerSnapshot() : getSnapshot()),
    [getServerSnapshot, getSnapshot, memoizedSelector]
  );

  const selection = React.useSyncExternalStore(subscribe, getSelection, getServerSelection);
  React.useDebugValue(selection);
  return selection;
}

export { useSyncExternalStoreWithSelector };
export default { useSyncExternalStoreWithSelector };
