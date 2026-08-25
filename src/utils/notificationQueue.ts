/**
 * Arrival policy for the toast slot.
 *
 * There is one visible toast at a time, and every notification used to take the
 * slot on arrival. That is right for the chatty ones — "Added label B", "Undid
 * edit" — where the newest message is the only interesting one and a queue
 * would just replay stale confirmations. It is wrong for errors, which carry a
 * "Copy details" button: an error could be pushed off screen by the next marker
 * confirmation before it could be read, let alone copied.
 *
 * So errors hold the slot until they are dismissed, and anything that arrives
 * behind one waits its turn instead of being dropped.
 */

export type NotificationType = 'info' | 'error' | 'success';

export interface NotificationLike {
  message: string;
  type: NotificationType;
  copyText?: string;
}

/**
 * How long a toast stays up on its own. Errors are null: they are the ones
 * worth acting on, so they wait for the reader rather than the clock.
 */
export const NOTIFICATION_AUTO_DISMISS_MS: Record<NotificationType, number | null> = {
  info: 2500,
  success: 2500,
  error: null,
};

/**
 * Waiting messages beyond this are dropped oldest-first rather than hoarded.
 * Errors are the exception: dropping one would lose the "Copy details" payload
 * that the whole queue exists to protect, so a waiting error yields its place
 * only once there is no chatter left to drop.
 */
export const MAX_QUEUED_NOTIFICATIONS = 3;

/** Trim to `maxQueued`, sacrificing the oldest chatter before any error. */
function trimQueue<T extends NotificationLike>(queued: readonly T[], maxQueued: number): T[] {
  const limit = Math.max(0, maxQueued);
  const kept = [...queued];
  while (kept.length > limit) {
    const chatterIndex = kept.findIndex((notification) => notification.type !== 'error');
    kept.splice(chatterIndex >= 0 ? chatterIndex : 0, 1);
  }
  return kept;
}

export interface NotificationQueueState<T extends NotificationLike> {
  displayed: T | null;
  queued: readonly T[];
}

export function emptyNotificationQueue<T extends NotificationLike>(): NotificationQueueState<T> {
  return { displayed: null, queued: [] };
}

/** Take a newly raised notification, either showing it now or queueing it. */
export function admitNotification<T extends NotificationLike>(
  state: NotificationQueueState<T>,
  incoming: T,
  maxQueued: number = MAX_QUEUED_NOTIFICATIONS
): NotificationQueueState<T> {
  if (state.displayed?.type !== 'error') {
    return { displayed: incoming, queued: state.queued };
  }
  return { displayed: state.displayed, queued: trimQueue([...state.queued, incoming], maxQueued) };
}

/** Dismiss the visible notification and promote whatever was waiting. */
export function dismissNotification<T extends NotificationLike>(
  state: NotificationQueueState<T>
): NotificationQueueState<T> {
  const [next, ...rest] = state.queued;
  return { displayed: next ?? null, queued: rest };
}

/** Milliseconds until this notification should clear itself, or null if it should not. */
export function autoDismissDelay(notification: NotificationLike | null): number | null {
  if (!notification) return null;
  return NOTIFICATION_AUTO_DISMISS_MS[notification.type];
}
