import React from 'react';
import { Timer } from '../Timer';

interface StatusBarProps {
  moveName: string;
  blackName: string;
  whiteName: string;
  komi: number;
  moveCount: number;
  capturedBlack: number;
  capturedWhite: number;
  endResult: string | null;
  onUndo: () => void;
  onResign: () => void;
  showTimer: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  moveName,
  blackName,
  whiteName,
  komi,
  moveCount,
  capturedBlack,
  capturedWhite,
  endResult,
  onUndo,
  onResign,
  showTimer,
}) => (
  <div className="status-bar">
    <div className="status-bar-section status-bar-left">
      <span className="status-bar-item">{moveName}</span>
      <span className="status-bar-divider">•</span>
      <span className="status-bar-text truncate">
        {blackName} vs {whiteName}
      </span>
      <span className="status-bar-divider">•</span>
      <span className="status-bar-item">Komi {komi}</span>
      <span className="status-bar-divider">•</span>
      <span className="status-bar-item">Moves {moveCount}</span>
      <span className="status-bar-divider">•</span>
      <span className="status-bar-item">
        Capt B:{capturedWhite} W:{capturedBlack}
      </span>
      {endResult && (
        <>
          <span className="status-bar-divider">•</span>
          <span className="status-bar-item">Result {endResult}</span>
        </>
      )}
    </div>
    <div className="status-bar-section status-bar-right">
      <button
        type="button"
        className="status-bar-button"
        onClick={onUndo}
        title="Undo (left arrow)"
      >
        Undo
      </button>
      <button
        type="button"
        className="status-bar-button danger"
        onClick={onResign}
      >
        Resign
      </button>
      {showTimer && (
        <>
          <span className="status-bar-divider">•</span>
          <Timer variant="status" />
        </>
      )}
    </div>
  </div>
);
