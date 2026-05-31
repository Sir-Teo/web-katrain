import React from 'react';
import { FaClipboard, FaTimes } from 'react-icons/fa';
import { readClipboardText } from '../utils/clipboard';

interface PasteSgfModalProps {
  onClose: () => void;
  onSubmit: (text: string) => Promise<boolean>;
}

export const PasteSgfModal: React.FC<PasteSgfModalProps> = ({ onClose, onSubmit }) => {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [text, setText] = React.useState('');
  const [status, setStatus] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  const readClipboard = async () => {
    setStatus(null);
    const clipboardText = await readClipboardText();
    if (clipboardText === null) {
      setStatus('Clipboard unavailable.');
      return;
    }
    setText(clipboardText);
    if (!clipboardText.trim()) setStatus('Clipboard is empty.');
  };

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || isSubmitting) return;
    setStatus(null);
    setIsSubmitting(true);
    try {
      const ok = await onSubmit(trimmed);
      if (ok) onClose();
      else setStatus('Could not load this SGF or OGS URL.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 mobile-safe-inset mobile-safe-area-bottom">
      <div className="ui-panel flex w-full max-w-2xl flex-col overflow-hidden rounded-lg border shadow-xl">
        <div className="ui-bar flex items-center justify-between border-b border-[var(--ui-border)] px-4 py-3">
          <h2 className="text-lg font-semibold text-[var(--ui-text)]">Paste SGF / OGS</h2>
          <button
            type="button"
            onClick={onClose}
            className="ui-control grid place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
            aria-label="Close paste SGF"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="min-h-[220px] w-full resize-y rounded-lg border ui-input px-3 py-2 font-mono text-sm text-[var(--ui-text)]"
            placeholder="SGF or OGS URL"
            aria-label="SGF or OGS URL"
          />
          {status && (
            <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-sm text-[var(--ui-text-muted)]">
              {status}
            </div>
          )}
        </div>

        <div className="ui-bar flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ui-border)] px-4 py-3">
          <button
            type="button"
            onClick={readClipboard}
            className="min-h-11 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]"
          >
            <span className="inline-flex items-center gap-2"><FaClipboard /> Read Clipboard</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!text.trim() || isSubmitting}
              className="min-h-11 rounded-lg border border-[var(--ui-accent)] bg-[var(--ui-accent)] px-4 py-2 text-sm font-semibold text-[var(--ui-accent-contrast)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? 'Opening...' : 'Open'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

PasteSgfModal.displayName = 'PasteSgfModal';
