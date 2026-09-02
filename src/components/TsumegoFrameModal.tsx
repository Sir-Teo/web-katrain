import React from 'react';
import { FaBorderAll, FaTimes } from 'react-icons/fa';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useInitialDialogFocus } from '../hooks/useInitialDialogFocus';
import {
  TSUMEGO_FRAME_MAX_MARGIN,
  TSUMEGO_FRAME_MIN_MARGIN,
  clampTsumegoFrameMargin,
} from '../utils/tsumegoFrameOptions';

interface TsumegoFrameModalProps {
  defaultMargin: number;
  defaultKoAllowed: boolean;
  onClose: () => void;
  onApply: (opts: { margin: number; koAllowed: boolean }) => void;
  returnFocus?: HTMLElement | null;
}

export const TsumegoFrameModal: React.FC<TsumegoFrameModalProps> = ({
  defaultMargin,
  defaultKoAllowed,
  onClose,
  onApply,
  returnFocus,
}) => {
  const [margin, setMargin] = React.useState(() => clampTsumegoFrameMargin(defaultMargin));
  const [koAllowed, setKoAllowed] = React.useState(defaultKoAllowed);
  useEscapeToClose(onClose);
  const dialogRef = useInitialDialogFocus<HTMLDivElement>(true, { focusContainer: false, returnFocus });

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-3 mobile-safe-inset mobile-safe-area-bottom">
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="tsumego-frame-modal ui-panel flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-lg border shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tsumego-frame-title"
        aria-describedby="tsumego-frame-description"
      >
        <div className="ui-bar flex items-center justify-between border-b border-[var(--ui-border)] px-4 py-3">
          <h2 id="tsumego-frame-title" className="text-lg font-semibold text-[var(--ui-text)]">
            Frame as Tsumego
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="ui-control grid place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
            aria-label="Close frame as tsumego"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <p id="tsumego-frame-description" className="text-sm leading-6 text-[var(--ui-text-muted)]">
            A problem alone in the corner looks like an almost empty board, and the engine reads it that way. This
            walls the problem off and settles the rest of the board, so life and death is the only thing left to
            decide — added as a new node, with the bare problem still in the tree.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="tsumego-frame-margin" className="block text-sm text-[var(--ui-text-muted)]">
                Distance of wall
              </label>
              <input
                id="tsumego-frame-margin"
                type="number"
                min={TSUMEGO_FRAME_MIN_MARGIN}
                max={TSUMEGO_FRAME_MAX_MARGIN}
                step={1}
                value={margin}
                onChange={(e) => setMargin(clampTsumegoFrameMargin(parseInt(e.target.value || '0', 10)))}
                className="w-full rounded border ui-input px-2 py-2 text-sm text-[var(--ui-text)]"
              />
              <p className="text-xs ui-text-faint">How much room to leave around the problem.</p>
            </div>

            <div className="space-y-1">
              <span className="block text-sm text-[var(--ui-text-muted)]">Ko</span>
              <label
                htmlFor="tsumego-frame-ko"
                className="flex min-h-11 items-center gap-2 rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 text-sm text-[var(--ui-text)]"
              >
                <input
                  id="tsumego-frame-ko"
                  type="checkbox"
                  checked={koAllowed}
                  onChange={(e) => setKoAllowed(e.target.checked)}
                  className="toggle"
                />
                <span>Ko allowed</span>
              </label>
              <p className="text-xs ui-text-faint">Sets who holds the ko threat far from the problem.</p>
            </div>
          </div>
        </div>

        <div className="ui-bar grid grid-cols-2 gap-2 border-t border-[var(--ui-border)] px-4 py-3 sm:flex sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onApply({ margin, koAllowed })}
            className="min-h-11 rounded-lg border border-[var(--ui-accent)] bg-[var(--ui-accent)] px-4 py-2 text-sm font-semibold text-[var(--ui-accent-contrast)] hover:brightness-110"
          >
            <span className="inline-flex items-center gap-2">
              <FaBorderAll aria-hidden="true" /> Frame position
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

TsumegoFrameModal.displayName = 'TsumegoFrameModal';
