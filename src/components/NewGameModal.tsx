import React from 'react';
import type { GameRules } from '../types';

interface NewGameModalProps {
  onClose: () => void;
  onStart: (opts: { komi: number; rules: GameRules }) => void;
  defaultKomi: number;
  defaultRules: GameRules;
}

export const NewGameModal: React.FC<NewGameModalProps> = ({
  onClose,
  onStart,
  defaultKomi,
  defaultRules,
}) => {
  const [komi, setKomi] = React.useState(() => defaultKomi);
  const [rules, setRules] = React.useState<GameRules>(() => defaultRules);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="ui-panel rounded-lg shadow-xl w-96 max-w-[90vw] overflow-hidden border">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--ui-border)] ui-bar">
          <h2 className="text-lg font-semibold text-[var(--ui-text)]">New Game</h2>
          <button onClick={onClose} className="ui-text-faint hover:text-white">✕</button>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[var(--ui-text-muted)] text-sm">Board Size</label>
              <input
                value="19"
                disabled
                className="w-full ui-input text-[var(--ui-text-muted)] rounded px-2 py-2 text-sm border"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[var(--ui-text-muted)] text-sm">Rules</label>
              <select
                value={rules}
                onChange={(e) => setRules(e.target.value as GameRules)}
                className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
              >
                <option value="japanese">Japanese</option>
                <option value="chinese">Chinese</option>
                <option value="korean">Korean</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[var(--ui-text-muted)] text-sm">Komi</label>
            <input
              type="number"
              step="0.5"
              value={komi}
              onChange={(e) => setKomi(Number(e.target.value))}
              className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
            />
          </div>
          <div className="text-xs ui-text-faint">
            Start a new 19×19 game with the selected rules and komi.
          </div>
        </div>
        <div className="px-4 py-3 border-t border-[var(--ui-border)] flex justify-end gap-2 ui-bar">
          <button
            className="px-3 py-2 rounded bg-[var(--ui-surface-2)] text-[var(--ui-text)] hover:brightness-110"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-3 py-2 rounded ui-accent-bg hover:brightness-110"
            onClick={() => onStart({ komi: Number.isFinite(komi) ? komi : defaultKomi, rules })}
          >
            Start
          </button>
        </div>
      </div>
    </div>
  );
};
