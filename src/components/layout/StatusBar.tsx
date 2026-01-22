import React from 'react';

interface StatusBarProps {
  moveName: string;
  blackName: string;
  whiteName: string;
  komi: number;
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
  moveCount,
  capturedBlack,
  capturedWhite,
  endResult,
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
  </div>
);
