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

    // One policy owns dismissal now, so this clears on the store's schedule
    // rather than the 1200ms timer the call site used to run for itself.
    vi.advanceTimersByTime(2500);

    expect(useGameStore.getState().notification).toBeNull();
  });

  it('guards component notification timers with the same identity check', () => {
    setTimedNotification('Older component message', 'info');
    vi.advanceTimersByTime(1000);
    const newerNotification = { message: 'Newer component message', type: 'success' as const };
    useGameStore.setState({ notification: newerNotification });

    // The older message's timer must not take the newer one down with it.
    vi.advanceTimersByTime(1500);

    expect(useGameStore.getState().notification).toBe(newerNotification);

    vi.advanceTimersByTime(1000);

    expect(useGameStore.getState().notification).toBeNull();
  });

  it('holds an error until it is dismissed, so its copy button stays reachable', () => {
    useGameStore.setState({ notification: { message: 'Analysis error: out of memory', type: 'error' } });

    vi.advanceTimersByTime(60_000);

    expect(useGameStore.getState().notification?.message).toBe('Analysis error: out of memory');
  });

  it('promotes a message that arrived while an error held the slot', () => {
    useGameStore.setState({ notification: { message: 'Analysis error', type: 'error' } });
    useGameStore.setState({ notification: { message: 'Added label B', type: 'info' } });

    expect(useGameStore.getState().notification?.message).toBe('Analysis error');

    useGameStore.getState().clearNotification();

    expect(useGameStore.getState().notification?.message).toBe('Added label B');
  });

  it('auto-dismisses store notifications that do not create their own timer', () => {
    useGameStore.getState().toggleEditMode();

    expect(useGameStore.getState().notification?.message).toBe('Edit mode: setup stones, labels, and markers are active.');

    vi.advanceTimersByTime(2499);
    expect(useGameStore.getState().notification?.message).toBe('Edit mode: setup stones, labels, and markers are active.');

    vi.advanceTimersByTime(1);
    expect(useGameStore.getState().notification).toBeNull();
  });
});
