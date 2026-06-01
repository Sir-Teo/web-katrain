import React from 'react';
import { FaClipboard, FaTimes } from 'react-icons/fa';
import { readClipboardText } from '../utils/clipboard';
import { getPasteSgfInputInfo, type PasteSgfSubmitResult } from '../utils/pasteSgfInput';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

type PasteSgfStatusTone = 'info' | 'error';

type PasteSgfStatus = {
  text: string;
  tone: PasteSgfStatusTone;
};

interface PasteSgfModalProps {
  onClose: () => void;
  onSubmit: (text: string) => Promise<PasteSgfSubmitResult>;
}

export const PasteSgfModal: React.FC<PasteSgfModalProps> = ({ onClose, onSubmit }) => {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [text, setText] = React.useState('');
  const [status, setStatus] = React.useState<PasteSgfStatus | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const inputInfo = React.useMemo(() => getPasteSgfInputInfo(text), [text]);
  useEscapeToClose(onClose);

  React.useEffect(() => {
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  const updateText = (nextText: string) => {
    setText(nextText);
    setStatus(null);
  };

  const readClipboard = async () => {
    setStatus(null);
    const clipboardText = await readClipboardText();
    if (clipboardText === null) {
      setStatus({ text: 'Clipboard unavailable.', tone: 'error' });
      return;
    }
    updateText(clipboardText);
    if (!clipboardText.trim()) setStatus({ text: 'Clipboard is empty.', tone: 'info' });
  };

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || isSubmitting) return;
    setStatus({ text: inputInfo.submitStatus, tone: 'info' });
    setIsSubmitting(true);
    try {
      const result = await onSubmit(trimmed);
      if (result === 'loaded') onClose();
      else if (result === 'cancelled') {
        setStatus({ text: 'Import canceled. Your current game was left unchanged.', tone: 'info' });
      } else {
        setStatus({ text: inputInfo.errorStatus, tone: 'error' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusClass =
    status?.tone === 'error'
      ? 'ui-danger-soft'
      : 'border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] text-[var(--ui-accent)]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 mobile-safe-inset mobile-safe-area-bottom">
      <div
        className="ui-panel flex w-full max-w-2xl flex-col overflow-hidden rounded-lg border shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="paste-sgf-title"
      >
        <div className="ui-bar flex items-center justify-between border-b border-[var(--ui-border)] px-4 py-3">
          <h2 id="paste-sgf-title" className="text-lg font-semibold text-[var(--ui-text)]">Paste SGF / OGS</h2>
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
            onChange={(event) => updateText(event.target.value)}
            className="min-h-[220px] w-full resize-y rounded-lg border ui-input px-3 py-2 font-mono text-sm text-[var(--ui-text)]"
            placeholder="(;GM[1]...) or https://online-go.com/game/12345"
            aria-label="SGF text or OGS game URL"
            aria-describedby="paste-sgf-helper paste-sgf-detection"
          />
          <div id="paste-sgf-helper" className="text-xs ui-text-faint">
            Paste a complete SGF, a game tree snippet, or a public Online-Go game URL.
          </div>
          <div
            id="paste-sgf-detection"
            className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-sm text-[var(--ui-text-muted)]"
            data-paste-sgf-input-kind={inputInfo.kind}
          >
            {inputInfo.helper}
          </div>
          {status && (
            <div
              className={`rounded-lg border px-3 py-2 text-sm ${statusClass}`}
              role={status.tone === 'error' ? 'alert' : 'status'}
              aria-live="polite"
            >
              {status.text}
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
