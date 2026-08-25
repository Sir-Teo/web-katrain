import { describe, expect, it } from 'vitest';
import {
  MAX_QUEUED_NOTIFICATIONS,
  admitNotification,
  autoDismissDelay,
  dismissNotification,
  emptyNotificationQueue,
  type NotificationLike,
} from '../src/utils/notificationQueue';

const info = (message: string): NotificationLike => ({ message, type: 'info' });
const error = (message: string): NotificationLike => ({ message, type: 'error', copyText: `${message} details` });

describe('toast arrival policy', () => {
  it('shows the newest chatty message straight away', () => {
    let state = admitNotification(emptyNotificationQueue<NotificationLike>(), info('Added label B'));
    state = admitNotification(state, info('Removed marker'));

    expect(state.displayed).toEqual(info('Removed marker'));
    expect(state.queued).toEqual([]);
  });

  it('lets an error take the slot from a confirmation', () => {
    let state = admitNotification(emptyNotificationQueue<NotificationLike>(), info('Added label B'));
    state = admitNotification(state, error('Analysis error: out of memory'));

    expect(state.displayed?.type).toBe('error');
  });

  it('keeps an unread error on screen and queues what arrives behind it', () => {
    let state = admitNotification(emptyNotificationQueue<NotificationLike>(), error('Analysis error'));
    state = admitNotification(state, info('Added label B'));
    state = admitNotification(state, info('Undid edit'));

    expect(state.displayed).toEqual(error('Analysis error'));
    expect(state.queued.map((n) => n.message)).toEqual(['Added label B', 'Undid edit']);
  });

  it('queues a second error rather than displacing the first', () => {
    let state = admitNotification(emptyNotificationQueue<NotificationLike>(), error('First'));
    state = admitNotification(state, error('Second'));

    expect(state.displayed?.message).toBe('First');
    expect(state.queued.map((n) => n.message)).toEqual(['Second']);
  });

  it('drops the oldest waiting message rather than hoarding a backlog', () => {
    let state = admitNotification(emptyNotificationQueue<NotificationLike>(), error('Analysis error'));
    for (const message of ['one', 'two', 'three', 'four']) state = admitNotification(state, info(message));

    expect(state.queued).toHaveLength(MAX_QUEUED_NOTIFICATIONS);
    expect(state.queued.map((n) => n.message)).toEqual(['two', 'three', 'four']);
  });

  it('sacrifices waiting chatter before a waiting error', () => {
    // A second engine error carries its own "Copy details"; routine markers
    // must not be able to push it out of the queue before it is ever seen.
    let state = admitNotification(emptyNotificationQueue<NotificationLike>(), error('First'));
    state = admitNotification(state, error('Second'));
    for (const message of ['one', 'two', 'three']) state = admitNotification(state, info(message));

    expect(state.queued).toHaveLength(MAX_QUEUED_NOTIFICATIONS);
    expect(state.queued.map((n) => n.message)).toEqual(['Second', 'two', 'three']);
  });

  it('drops the oldest error only once there is no chatter left to drop', () => {
    let state = admitNotification(emptyNotificationQueue<NotificationLike>(), error('E0'));
    for (const message of ['E1', 'E2', 'E3', 'E4']) state = admitNotification(state, error(message));

    expect(state.queued.map((n) => n.message)).toEqual(['E2', 'E3', 'E4']);
  });

  it('promotes the next waiting message when the error is dismissed', () => {
    let state = admitNotification(emptyNotificationQueue<NotificationLike>(), error('Analysis error'));
    state = admitNotification(state, info('Added label B'));

    state = dismissNotification(state);
    expect(state.displayed).toEqual(info('Added label B'));

    state = dismissNotification(state);
    expect(state.displayed).toBeNull();
    expect(state.queued).toEqual([]);
  });
});

describe('toast dismissal timing', () => {
  it('never times out an error, which is the one worth acting on', () => {
    expect(autoDismissDelay(error('Analysis error'))).toBeNull();
  });

  it('times out confirmations', () => {
    expect(autoDismissDelay(info('Added label B'))).toBe(2500);
    expect(autoDismissDelay({ message: 'Saved', type: 'success' })).toBe(2500);
  });

  it('has nothing to schedule for an empty slot', () => {
    expect(autoDismissDelay(null)).toBeNull();
  });
});
