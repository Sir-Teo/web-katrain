import { useGameStore } from '../store/gameStore';

export type TimedNotificationType = 'info' | 'error' | 'success';

/**
 * Raise a toast. Dismissal is deliberately not a caller's decision: the store
 * holds errors until they are read — they are the ones carrying "Copy details"
 * — and times the rest out uniformly. Call sites used to pass their own delay
 * and race the store's timer for the same slot.
 */
export function setTimedNotification(message: string, type: TimedNotificationType = 'info'): void {
  useGameStore.setState({ notification: { message, type } });
}
