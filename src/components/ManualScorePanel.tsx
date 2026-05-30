import React from 'react';
import { FaCalculator, FaTimes, FaUndo } from 'react-icons/fa';
import type { ManualScoreEstimate } from '../utils/scoring';

interface ManualScorePanelProps {
  active: boolean;
  disabled?: boolean;
  score: ManualScoreEstimate;
  blackName: string;
  whiteName: string;
  onToggle: () => void;
  onClear: () => void;
  onDone: () => void;
}

const formatScoreValue = (value: number): string => Number.isInteger(value) ? String(value) : value.toFixed(1);

export const ManualScorePanel: React.FC<ManualScorePanelProps> = ({
  active,
  disabled = false,
  score,
  blackName,
  whiteName,
  onToggle,
  onClear,
  onDone,
}) => {
  if (!active) {
    return (
      <button
        type="button"
        className="manual-score-launch"
        onClick={onToggle}
        disabled={disabled}
        title={disabled ? 'Finish editing before scoring.' : 'Score position'}
        aria-label="Score position"
      >
        <FaCalculator size={13} />
        <span>Score</span>
      </button>
    );
  }

  const leaderClass = score.scoreLead >= 0 ? 'black' : 'white';

  return (
    <section className="manual-score-panel" aria-label="Manual score">
      <div className="manual-score-header">
        <div className="manual-score-title">
          <FaCalculator size={13} />
          <span>Score</span>
        </div>
        <button type="button" className="manual-score-icon" onClick={onDone} title="Done" aria-label="Done scoring">
          <FaTimes size={12} />
        </button>
      </div>

      <div className={['manual-score-result', leaderClass].join(' ')}>
        {score.result}
      </div>

      <div className="manual-score-totals">
        <div>
          <span className="manual-score-stone black" aria-hidden="true" />
          <span className="truncate">{blackName}</span>
          <strong>{formatScoreValue(score.blackScore)}</strong>
        </div>
        <div>
          <span className="manual-score-stone white" aria-hidden="true" />
          <span className="truncate">{whiteName}</span>
          <strong>{formatScoreValue(score.whiteScore)}</strong>
        </div>
      </div>

      <div className="manual-score-breakdown">
        <div>
          <span>Territory</span>
          <b>{score.blackTerritory}</b>
          <b>{score.whiteTerritory}</b>
        </div>
        <div>
          <span>Dead stones</span>
          <b>{score.whiteDeadStones}</b>
          <b>{score.blackDeadStones}</b>
        </div>
      </div>

      <div className="manual-score-actions">
        <button type="button" onClick={onClear} title="Clear dead stones">
          <FaUndo size={12} />
          <span>Clear</span>
        </button>
        <button type="button" className="primary" onClick={onDone}>
          <FaTimes size={12} />
          <span>Done</span>
        </button>
      </div>
    </section>
  );
};
