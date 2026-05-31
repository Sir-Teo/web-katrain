import { FaCheckCircle, FaExclamationTriangle, FaInfoCircle, FaTimes } from 'react-icons/fa';

export type NotificationToastType = 'info' | 'error' | 'success';

export interface NotificationToastMessage {
  message: string;
  type: NotificationToastType;
}

interface NotificationToastProps {
  notification: NotificationToastMessage;
  onClose: () => void;
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

export function NotificationToast({ notification, onClose }: NotificationToastProps) {
  const meta = notificationMeta[notification.type];
  const Icon = meta.Icon;

  return (
    <div className="notification-toast-region" data-notification-region="true">
      <div
        className={`notification-toast notification-toast-${notification.type}`}
        role={meta.role}
        aria-live={meta.live}
        aria-atomic="true"
        data-notification="true"
        data-notification-type={notification.type}
      >
        <span className="notification-toast-icon" aria-hidden="true">
          <Icon size={16} />
        </span>
        <span className="notification-toast-message">
          <span className="sr-only">{meta.label}: </span>
          {notification.message}
        </span>
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
