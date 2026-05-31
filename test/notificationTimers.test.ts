import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { setTimedNotification } from '../src/utils/timedNotification';

describe('notification auto-dismiss timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.setState({
      isContinuousAnalysis: true,
      isAnalysisMode: true,
      notification: null,
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    useGameStore.setState({
      isContinuousAnalysis: false,
      notification: null,
    });
  });

  it('does not let an older timer clear a newer notification', () => {
    useGameStore.getState().toggleContinuousAnalysis(false);
    const newerNotification = { message: 'Newer message', type: 'success' as const };
    useGameStore.setState({ notification: newerNotification });

    vi.advanceTimersByTime(1200);

    expect(useGameStore.getState().notification).toBe(newerNotification);
  });

  it('clears the matching notification when it is still current', () => {
    useGameStore.getState().toggleContinuousAnalysis(false);

    vi.advanceTimersByTime(1200);

    expect(useGameStore.getState().notification).toBeNull();
  });

  it('guards component notification timers with the same identity check', () => {
    setTimedNotification('Older component message', 'info', 2500);
    const newerNotification = { message: 'Newer component message', type: 'success' as const };
    useGameStore.setState({ notification: newerNotification });

    vi.advanceTimersByTime(2500);

    expect(useGameStore.getState().notification).toBe(newerNotification);
  });
});
