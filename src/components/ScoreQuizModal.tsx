import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FaTimes, FaDice, FaCheck } from 'react-icons/fa';
import { useGameStore } from '../store/gameStore';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { StaticBoard } from './StaticBoard';
import { evaluateNode } from '../utils/positionEval';
import type { GameNode } from '../types';

interface ScoreQuizModalProps {
  onClose: () => void;
}

type Phase = 'guess' | 'evaluating' | 'reveal';
type Winner = 'black' | 'white';

interface QuizStats {
  rounds: number;
  sumError: number;
  leaderHits: number;
}

const collectMainLine = (root: GameNode): GameNode[] => {
  const line: GameNode[] = [];
  let node: GameNode | null = root;
  while (node) {
    line.push(node);
    node = node.children[0] ?? null;
  }
  return line;
};

const ratingFor = (error: number): { label: string; tone: string } => {
  if (error <= 1.5) return { label: 'Perfect read', tone: 'var(--ui-success, #38a169)' };
  if (error <= 4) return { label: 'Great estimate', tone: 'var(--ui-success, #38a169)' };
  if (error <= 8) return { label: 'Close', tone: 'var(--ui-warn, #d69e2e)' };
  return { label: 'Off the mark', tone: 'var(--ui-danger, #e53e3e)' };
};

export const ScoreQuizModal: React.FC<ScoreQuizModalProps> = ({ onClose }) => {
  useEscapeToClose(onClose);

  const currentNode = useGameStore((s) => s.currentNode);
  const rootNode = useGameStore((s) => s.rootNode);
  const settings = useGameStore((s) => s.settings);
  const jumpToNode = useGameStore((s) => s.jumpToNode);

  const [phase, setPhase] = useState<Phase>('guess');
  const [winner, setWinner] = useState<Winner>('black');
  const [margin, setMargin] = useState<string>('5');
  const [actual, setActual] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [stats, setStats] = useState<QuizStats>({ rounds: 0, sumError: 0, leaderHits: 0 });

  const nodeId = currentNode.id;
  const board = currentNode.gameState.board;
  const moveNumber = currentNode.gameState.moveHistory.length;
  const lastMove = currentNode.move && currentNode.move.x >= 0
    ? { x: currentNode.move.x, y: currentNode.move.y }
    : null;

  // Reset the round whenever the quizzed position changes (adjust state during
  // render, the React-recommended alternative to a reset effect).
  const [roundNodeId, setRoundNodeId] = useState(nodeId);
  if (nodeId !== roundNodeId) {
    setRoundNodeId(nodeId);
    setPhase('guess');
    setActual(null);
    setErrorMsg(null);
  }

  const handleReveal = useCallback(async () => {
    setErrorMsg(null);
    setPhase('evaluating');
    try {
      const result = await evaluateNode(currentNode, settings);
      const lead = result.blackScoreLead;
      setActual(lead);
      const signedGuess = (winner === 'black' ? 1 : -1) * Math.abs(Number(margin) || 0);
      const err = Math.abs(signedGuess - lead);
      const leaderRight = Math.sign(signedGuess) === Math.sign(lead) || Math.abs(lead) < 0.5;
      setStats((s) => ({
        rounds: s.rounds + 1,
        sumError: s.sumError + err,
        leaderHits: s.leaderHits + (leaderRight ? 1 : 0),
      }));
      setPhase('reveal');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Evaluation failed. Is the engine loaded?');
      setPhase('guess');
    }
  }, [currentNode, settings, winner, margin]);

  const handleRandom = useCallback(() => {
    const line = collectMainLine(rootNode);
    // Prefer mid/late-game positions where score judgement is meaningful.
    const candidates = line.filter((n) => n.gameState.moveHistory.length >= Math.min(20, line.length - 1));
    const pool = candidates.length > 0 ? candidates : line;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick && pick.id !== nodeId) {
      jumpToNode(pick);
    } else {
      // Same node picked: reset round anyway.
      setPhase('guess');
      setActual(null);
    }
  }, [rootNode, jumpToNode, nodeId]);

  const signedGuess = (winner === 'black' ? 1 : -1) * Math.abs(Number(margin) || 0);
  const roundError = actual !== null ? Math.abs(signedGuess - actual) : 0;
  const rating = useMemo(() => ratingFor(roundError), [roundError]);
  const avgError = stats.rounds > 0 ? stats.sumError / stats.rounds : 0;

  const marginInputRef = useRef<HTMLInputElement>(null);

  const actualLeader: Winner | 'even' = actual === null
    ? 'even'
    : Math.abs(actual) < 0.5 ? 'even' : actual > 0 ? 'black' : 'white';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-3 mobile-safe-inset mobile-safe-area-bottom"
      onClick={onClose}
    >
      <div
        className="ui-panel flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="score-quiz-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ui-bar flex items-center justify-between border-b border-[var(--ui-border)] px-4 py-3">
          <h2 id="score-quiz-title" className="text-lg font-semibold text-[var(--ui-text)]">
            Score Estimation Quiz
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="ui-control grid place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
            aria-label="Close quiz"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <p className="text-sm text-[var(--ui-text-muted)]">
            Read the position, then estimate who is ahead and by how many points. Move {moveNumber}.
          </p>

          <div className="mx-auto w-full max-w-[340px]">
            <StaticBoard board={board} lastMove={lastMove} ariaLabel={`Quiz position at move ${moveNumber}`} />
          </div>

          {phase !== 'reveal' ? (
            <div className="space-y-3">
              <div className="text-sm font-semibold text-[var(--ui-text)]">Who is ahead?</div>
              <div className="grid grid-cols-2 gap-2">
                {(['black', 'white'] as Winner[]).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setWinner(w)}
                    className={`min-h-11 rounded-lg border px-4 py-2 text-sm font-semibold capitalize ${
                      winner === w
                        ? 'border-[var(--ui-accent)] bg-[var(--ui-accent-soft,var(--ui-surface-2))] text-[var(--ui-text)]'
                        : 'border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)]'
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>
              <label className="flex items-center justify-between gap-3 text-sm text-[var(--ui-text)]">
                <span className="font-semibold">By how many points?</span>
                <input
                  ref={marginInputRef}
                  type="number"
                  min={0}
                  step={0.5}
                  value={margin}
                  onChange={(e) => setMargin(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleReveal(); }}
                  className="w-24 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-right text-[var(--ui-text)]"
                />
              </label>
              {errorMsg && (
                <div className="rounded border border-[var(--ui-danger)] bg-[var(--ui-danger-soft)] px-3 py-2 text-sm text-[var(--ui-danger)]">
                  {errorMsg}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3 text-sm">
              <div className="text-base font-semibold" style={{ color: rating.tone }}>{rating.label}</div>
              <div className="flex justify-between text-[var(--ui-text)]">
                <span>Actual</span>
                <span className="font-semibold">
                  {actualLeader === 'even'
                    ? 'Even'
                    : `${actualLeader === 'black' ? 'Black' : 'White'} +${Math.abs(actual ?? 0).toFixed(1)}`}
                </span>
              </div>
              <div className="flex justify-between text-[var(--ui-text-muted)]">
                <span>Your guess</span>
                <span>{`${winner === 'black' ? 'Black' : 'White'} +${Math.abs(Number(margin) || 0).toFixed(1)}`}</span>
              </div>
              <div className="flex justify-between text-[var(--ui-text-muted)]">
                <span>Off by</span>
                <span>{roundError.toFixed(1)} pts</span>
              </div>
            </div>
          )}

          {stats.rounds > 0 && (
            <div className="flex justify-between text-xs text-[var(--ui-text-muted)]">
              <span>Rounds: {stats.rounds}</span>
              <span>Leader correct: {stats.leaderHits}/{stats.rounds}</span>
              <span>Avg error: {avgError.toFixed(1)} pts</span>
            </div>
          )}
        </div>

        <div className="ui-bar flex flex-wrap justify-end gap-2 border-t border-[var(--ui-border)] px-4 py-3">
          <button
            type="button"
            onClick={handleRandom}
            className="min-h-11 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]"
          >
            <span className="inline-flex items-center gap-2"><FaDice aria-hidden="true" /> Random position</span>
          </button>
          {phase === 'reveal' ? (
            <button
              type="button"
              onClick={() => { setPhase('guess'); setActual(null); }}
              className="min-h-11 rounded-lg border border-[var(--ui-accent)] bg-[var(--ui-accent-soft,var(--ui-surface-2))] px-4 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]"
            >
              Guess again
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleReveal()}
              disabled={phase === 'evaluating'}
              className="min-h-11 rounded-lg border border-[var(--ui-accent)] bg-[var(--ui-accent-soft,var(--ui-surface-2))] px-4 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)] disabled:opacity-60"
            >
              <span className="inline-flex items-center gap-2">
                <FaCheck aria-hidden="true" /> {phase === 'evaluating' ? 'Evaluating…' : 'Reveal score'}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

ScoreQuizModal.displayName = 'ScoreQuizModal';
