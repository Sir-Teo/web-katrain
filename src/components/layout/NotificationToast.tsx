import React from 'react';
import { FaCheck, FaCheckCircle, FaCopy, FaExclamationTriangle, FaInfoCircle, FaTimes } from 'react-icons/fa';
import { copyTextToClipboard } from '../../utils/clipboard';

export type NotificationToastType = 'info' | 'error' | 'success';

export interface NotificationToastMessage {
  message: string;
  type: NotificationToastType;
  copyText?: string;
  /** The change behind this toast can be taken back from the toast itself. */
  undoable?: boolean;
}

interface NotificationToastProps {
  notification: NotificationToastMessage;
  onClose: () => void;
  commandBarVisible?: boolean;
  placement?: 'default' | 'desktop-dashboard';
  /** Called as the pointer or focus enters and leaves, to hold the dismissal timer. */
  onHoldChange?: (held: boolean) => void;
  /** Reverts the change the toast is reporting; enables the Undo button. */
  onUndo?: () => void;
}

const notificationMeta = {
  info: {
    Icon: FaInfoCircle,
    label: 'Info',
    role: 'status',
    live: 'polite',
  },
  success: {
    Icon: FaCheckCircle,
    label: 'Success',
    role: 'status',
    live: 'polite',
  },
  error: {
    Icon: FaExclamationTriangle,
    label: 'Error',
    role: 'alert',
    live: 'assertive',
  },
} as const;

export function NotificationToast({
  notification,
  onClose,
  commandBarVisible = false,
  placement = 'default',
  onHoldChange,
  onUndo,
}: NotificationToastProps) {
  const meta = notificationMeta[notification.type];
  const Icon = meta.Icon;
  const [copyState, setCopyState] = React.useState<'idle' | 'copied' | 'failed'>('idle');
  const canCopy = notification.type === 'error';

  React.useEffect(() => {
    setCopyState('idle');
  }, [notification.copyText, notification.message, notification.type]);

  const handleCopy = async () => {
    setCopyState((await copyTextToClipboard(notification.copyText ?? notification.message)) ? 'copied' : 'failed');
  };

  return (
    <div
      className={[
        'notification-toast-region',
        commandBarVisible ? 'notification-toast-region--below-command-bar' : '',
        placement === 'desktop-dashboard' ? 'notification-toast-region--desktop-dashboard' : '',
      ].join(' ')}
      data-notification-region="true"
    >
      <div
        className={`notification-toast notification-toast-${notification.type}`}
        role={meta.role}
        aria-live={meta.live}
        aria-atomic="true"
        data-notification="true"
        data-notification-type={notification.type}
        onMouseEnter={() => onHoldChange?.(true)}
        onMouseLeave={() => onHoldChange?.(false)}
        onFocus={() => onHoldChange?.(true)}
        onBlur={() => onHoldChange?.(false)}
      >
        <span className="notification-toast-icon" aria-hidden="true">
          <Icon size={16} />
        </span>
        <span className="notification-toast-message">
          <span className="sr-only">{meta.label}: </span>
          {notification.message}
        </span>
        {notification.undoable && onUndo && (
          <button
            type="button"
            className="notification-toast-undo"
            onClick={onUndo}
            data-notification-undo="true"
          >
            Undo
          </button>
        )}
        {canCopy && (
          <button
            type="button"
            className={['notification-toast-action', copyState === 'copied' ? 'copied' : ''].join(' ')}
            onClick={() => void handleCopy()}
            aria-label={
              copyState === 'copied'
                ? 'Notification copied'
                : copyState === 'failed'
                  ? 'Copy notification failed'
                  : 'Copy notification'
            }
            title={copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy notification'}
            data-notification-copy="true"
          >
            {copyState === 'copied' ? <FaCheck size={13} /> : <FaCopy size={13} />}
          </button>
        )}
        <button
          type="button"
          className="notification-toast-close"
          onClick={onClose}
          aria-label="Dismiss notification"
          title="Dismiss notification"
        >
          <FaTimes size={13} />
        </button>
      </div>
    </div>
  );
}
