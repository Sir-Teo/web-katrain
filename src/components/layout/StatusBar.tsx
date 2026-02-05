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
  <div className="status-bar">
    <div className="status-bar-section status-bar-left">
      <span className="status-bar-item">{moveName}</span>
      <span className="status-bar-divider">•</span>
      <span className="status-bar-text status-bar-matchup truncate" title={`${blackName} vs ${whiteName}`}>
        <span className="status-player status-player-black" aria-hidden="true" />
        <span>{blackName}</span>
        <span className="status-bar-item">vs</span>
        <span className="status-player status-player-white" aria-hidden="true" />
        <span>{whiteName}</span>
      </span>
      <span className="status-bar-divider">•</span>
      <span className="status-bar-item">Komi {komi}</span>
      <span className="status-bar-divider">•</span>
      <span className="status-bar-item">Size {boardSize}x{boardSize}</span>
      {handicap > 0 && (
        <>
          <span className="status-bar-divider">•</span>
          <span className="status-bar-item">Handicap {handicap}</span>
        </>
      )}
      <span className="status-bar-divider">•</span>
      <span className="status-bar-item">Moves {moveCount}</span>
      <span className="status-bar-divider">•</span>
      <span className="status-bar-item status-bar-captures" title="Stones captured by each player">
        Captures
        <span className="status-player status-player-black" aria-hidden="true" />
        {capturedWhite}
        <span className="status-player status-player-white" aria-hidden="true" />
        {capturedBlack}
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
