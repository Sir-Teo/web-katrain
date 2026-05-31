import { useGameStore } from '../store/gameStore';

export type TimedNotificationType = 'info' | 'error' | 'success';

export function setTimedNotification(
  message: string,
  type: TimedNotificationType = 'info',
  delayMs = 2500
): void {
  const notification = { message, type };
  useGameStore.setState({ notification });
  globalThis.setTimeout(() => {
    useGameStore.setState((state) => (state.notification === notification ? { notification: null } : {}));
  }, delayMs);
}
