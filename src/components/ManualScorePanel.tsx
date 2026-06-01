import React from 'react';
import { FaCalculator, FaChevronDown, FaChevronUp, FaMagic, FaTimes, FaUndo } from 'react-icons/fa';
import type { ManualScoreEstimate } from '../utils/scoring';

interface ManualScorePanelProps {
  active: boolean;
  disabled?: boolean;
  isCompact?: boolean;
  commandBarOffset?: boolean;
  scoreMode?: 'manual' | 'estimate';
  score: ManualScoreEstimate;
  blackName: string;
  whiteName: string;
  capturedBlack: number;
  capturedWhite: number;
  komi: number;
  deadStoneCount: number;
  onToggle: () => void;
  onAutoEstimate?: () => void;
  onUseManualScore?: () => void;
  canAutoEstimate?: boolean;
  onClear: () => void;
  onDone: () => void;
}

const formatScoreValue = (value: number): string => Number.isInteger(value) ? String(value) : value.toFixed(1);

export const ManualScorePanel: React.FC<ManualScorePanelProps> = ({
  active,
  disabled = false,
  isCompact = false,
  commandBarOffset = false,
  scoreMode = 'manual',
  score,
  blackName,
  whiteName,
  capturedBlack,
  capturedWhite,
  komi,
  deadStoneCount,
  onToggle,
  onAutoEstimate,
  onUseManualScore,
  canAutoEstimate = false,
  onClear,
  onDone,
}) => {
  const detailsId = React.useId();
  const [showDetails, setShowDetails] = React.useState(!isCompact);

  React.useEffect(() => {
    if (active) setShowDetails(!isCompact);
  }, [active, isCompact]);

  if (!active) {
    return (
      <button
        type="button"
        className={['manual-score-launch', commandBarOffset ? 'manual-score-offset' : ''].join(' ')}
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

  const leaderClass = score.scoreLead > 0 ? 'black' : score.scoreLead < 0 ? 'white' : 'jigo';
  return (
    <section className={['manual-score-panel', commandBarOffset ? 'manual-score-offset' : ''].join(' ')} aria-label="Manual score">
      <div className="manual-score-header">
        <div className="manual-score-title">
          <FaCalculator size={13} />
          <span>Score</span>
        </div>
        <span className="manual-score-count" title="Marked dead stones">
          {deadStoneCount} dead
        </span>
        <button type="button" className="manual-score-icon" onClick={onDone} title="Done" aria-label="Done scoring">
          <FaTimes size={12} />
        </button>
      </div>

      <div className="manual-score-method" role="group" aria-label="Scoring method">
        <button
          type="button"
          className={scoreMode === 'estimate' ? 'active' : ''}
          onClick={onAutoEstimate}
          disabled={!onAutoEstimate || !canAutoEstimate}
          title={canAutoEstimate ? 'Estimate dead stones from ownership' : 'Run territory analysis before estimating'}
        >
          <FaMagic size={11} />
          <span>Estimate</span>
        </button>
        <button
          type="button"
          className={scoreMode === 'manual' ? 'active' : ''}
          onClick={onUseManualScore}
          disabled={scoreMode === 'manual'}
          title="Use current dead-stone marks as the final manual score"
        >
          <span>Final</span>
        </button>
      </div>

      <div className={['manual-score-result', leaderClass].join(' ')}>
        {scoreMode === 'estimate' && <span className="manual-score-estimate-mark">≈</span>}
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

      <div className="manual-score-details">
        <button
          type="button"
          className="manual-score-details-toggle"
          onClick={() => setShowDetails((value) => !value)}
          aria-expanded={showDetails}
          aria-controls={detailsId}
        >
          <span>Details</span>
          {showDetails ? <FaChevronUp size={11} /> : <FaChevronDown size={11} />}
        </button>
        <div id={detailsId} className="manual-score-breakdown" hidden={!showDetails}>
          <div className="manual-score-breakdown-header" aria-hidden="true">
            <span />
            <b>B</b>
            <b>W</b>
          </div>
          <div>
            <span>Territory</span>
            <b>{score.blackTerritory}</b>
            <b>{score.whiteTerritory}</b>
          </div>
          <div>
            <span>Neutral</span>
            <b className="manual-score-muted" aria-label={`${score.neutralPoints} neutral points`}>
              {score.neutralPoints}
            </b>
            <b className="manual-score-muted">-</b>
          </div>
          <div>
            <span>Prisoners</span>
            <b>{capturedWhite}</b>
            <b>{capturedBlack}</b>
          </div>
          <div>
            <span>Dead stones</span>
            <b>{score.whiteDeadStones}</b>
            <b>{score.blackDeadStones}</b>
          </div>
          <div>
            <span>Komi</span>
            <b className="manual-score-muted">-</b>
            <b>{formatScoreValue(komi)}</b>
          </div>
        </div>
      </div>

      <div className="manual-score-actions">
        <button
          type="button"
          onClick={onAutoEstimate}
          disabled={!onAutoEstimate || !canAutoEstimate}
          title={canAutoEstimate ? 'Estimate dead stones from ownership' : 'Run territory analysis before auto-estimating'}
          className={scoreMode === 'estimate' ? 'active' : ''}
        >
          <FaMagic size={12} />
          <span>Auto</span>
        </button>
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
