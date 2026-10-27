import React from 'react';
import { FaCheck, FaCheckCircle, FaCopy, FaExclamationTriangle, FaInfoCircle, FaTimes } from 'react-icons/fa';
import { beginClipboardWriteRequest, copyTextToClipboard, isClipboardWriteRequestCurrent } from '../../utils/clipboard';
import { useDocumentFlag } from '../../hooks/useDocumentFlag';
import { revealFocusedButton } from '../../utils/revealFocusedButton';

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
  placement?: 'default' | 'desktop-dashboard' | 'desktop-header' | 'mobile-panel';
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
  const toastRef = React.useRef<HTMLDivElement>(null);
  const copyRequestRef = React.useRef(0);
  const canCopy = notification.type === 'error';
  // Tells the install card to step aside while a toast is up (index.css).
  useDocumentFlag('notification-shown', 'true');

  React.useEffect(() => {
    if (placement !== 'mobile-panel') return;
    const frame = requestAnimationFrame(() => {
      const region = toastRef.current?.parentElement;
      if (region) revealFocusedButton(region);
    });
    return () => cancelAnimationFrame(frame);
  }, [notification, placement]);

  const syncHold = React.useCallback(() => {
    const node = toastRef.current;
    onHoldChange?.(!!node && (node.matches(':hover') || node.contains(document.activeElement)));
  }, [onHoldChange]);

  React.useEffect(() => {
    syncHold();
    // Removing a hovered/focused toast does not dispatch leave or blur.
    return () => onHoldChange?.(false);
  }, [notification, onHoldChange, syncHold]);

  React.useEffect(() => {
    setCopyState('idle');
    // Capture the counter object; cleanup must invalidate its latest request.
    const requests = copyRequestRef;
    return () => { requests.current++; };
  }, [notification.copyText, notification.message, notification.type]);

  const handleCopy = async () => {
    const request = ++copyRequestRef.current;
    const clipboardRequest = beginClipboardWriteRequest();
    const copied = await copyTextToClipboard(notification.copyText ?? notification.message, undefined, undefined, clipboardRequest);
    if (copyRequestRef.current !== request || !isClipboardWriteRequestCurrent(clipboardRequest)) return;
    setCopyState(copied ? 'copied' : 'failed');
  };

  return (
    <div
      className={[
        'notification-toast-region',
        commandBarVisible ? 'notification-toast-region--below-command-bar' : '',
        placement === 'desktop-dashboard' ? 'notification-toast-region--desktop-dashboard' : '',
        placement === 'desktop-header' ? 'notification-toast-region--desktop-header' : '',
        placement === 'mobile-panel' ? 'notification-toast-region--mobile-panel' : '',
      ].join(' ')}
      data-notification-region="true"
    >
      <div
        ref={toastRef}
        className={`notification-toast notification-toast-${notification.type}`}
        role={meta.role}
        aria-live={meta.live}
        aria-atomic="true"
        data-notification="true"
        data-notification-type={notification.type}
        onMouseEnter={syncHold}
        onMouseLeave={syncHold}
        onFocus={syncHold}
        onBlur={(event) => {
          if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
          syncHold();
        }}
      >
        <span className="notification-toast-icon" aria-hidden="true">
          <Icon size={16} />
        </span>
        <span
          className="notification-toast-message"
          title={notification.message}
          tabIndex={canCopy ? 0 : undefined}
          onKeyDown={(event) => {
            if (canCopy && !event.ctrlKey && !event.metaKey && !event.altKey) event.stopPropagation();
          }}
        >
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
