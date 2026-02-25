import React from 'react';

interface StatusBarProps {
  moveName: string;
  blackName: string;
  whiteName: string;
  komi: number;
  boardSize: number;
  handicap: number;
  moveCount: number;
  capturedBlack: number;
  capturedWhite: number;
  endResult: string | null;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  moveName,
  blackName,
  whiteName,
  komi,
  boardSize,
  handicap,
  moveCount,
  capturedBlack,
  capturedWhite,
  endResult,
}) => (
  <div className="status-bar flex flex-wrap gap-2 px-3 py-2 items-center text-xs">
    <div className="status-bar-section flex flex-wrap gap-2 items-center">
      <div className="px-2 py-1 rounded bg-[var(--ui-surface-2)] text-[var(--ui-text)] font-semibold border border-[var(--ui-border)] shadow-sm">
        {moveName}
      </div>

      <div className="px-2 py-1 rounded bg-[var(--ui-surface)] text-[var(--ui-text-muted)] border border-[var(--ui-border)] shadow-sm flex items-center gap-1.5 truncate max-w-[250px]" title={`${blackName} vs ${whiteName}`}>
        <span className="status-player status-player-black" aria-hidden="true" />
        <span className="truncate">{blackName}</span>
        <span className="text-[var(--ui-text-faint)]">vs</span>
        <span className="status-player status-player-white" aria-hidden="true" />
        <span className="truncate">{whiteName}</span>
      </div>

      <div className="px-2 py-1 rounded bg-[var(--ui-surface)] text-[var(--ui-text-muted)] border border-[var(--ui-border)] shadow-sm">
        Komi: <span className="text-[var(--ui-text)] font-medium">{komi}</span>
      </div>

      <div className="px-2 py-1 rounded bg-[var(--ui-surface)] text-[var(--ui-text-muted)] border border-[var(--ui-border)] shadow-sm">
        Size: <span className="text-[var(--ui-text)] font-medium">{boardSize}×{boardSize}</span>
      </div>

      {handicap > 0 && (
        <div className="px-2 py-1 rounded bg-[var(--ui-accent-soft)] text-[var(--ui-accent)] font-medium border border-[var(--ui-accent)] shadow-sm">
          H{handicap}
        </div>
      )}

      <div className="px-2 py-1 rounded bg-[var(--ui-surface)] text-[var(--ui-text-muted)] border border-[var(--ui-border)] shadow-sm xl:flex hidden">
        Moves: <span className="text-[var(--ui-text)] font-medium">{moveCount}</span>
      </div>

      <div className="px-2 py-1 rounded bg-[var(--ui-surface)] text-[var(--ui-text-muted)] border border-[var(--ui-border)] shadow-sm hidden md:flex items-center gap-1.5" title="Stones captured by each player">
        Captures:
        <span className="flex items-center gap-1 ml-1">
          <span className="status-player status-player-black" aria-hidden="true" />
          <span className="text-white font-medium">{capturedWhite}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="status-player status-player-white" aria-hidden="true" />
          <span className="text-white font-medium">{capturedBlack}</span>
        </span>
      </div>

      {endResult && (
        <div className="px-2 py-1 rounded bg-[var(--ui-success-soft)] text-[var(--ui-success)] font-bold border border-[var(--ui-success)] shadow-sm">
          {endResult}
        </div>
      )}
    </div>
  </div>
);
