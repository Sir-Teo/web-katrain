import React, { useState } from 'react';
import { FaTimes, FaTrophy, FaPlay, FaFlag } from 'react-icons/fa';
import { KOMI, type BoardSize, type Player } from '../types';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useTournamentStore } from '../store/tournamentStore';
import { formatKyuRank, type LadderState } from '../utils/tournament';

interface TournamentModalProps {
  onClose: () => void;
  /** Set up and start the live game for the current rung, then close the modal. */
  onPlayGame: (ladder: LadderState) => void;
}

const BOARD_OPTIONS: BoardSize[] = [9, 13, 19];
const RANK_OPTIONS = [18, 15, 12, 10, 8, 5, 3, 1, 0, -2, -4];

export const TournamentModal: React.FC<TournamentModalProps> = ({ onClose, onPlayGame }) => {
  useEscapeToClose(onClose);

  const ladder = useTournamentStore((s) => s.ladder);
  const startLadder = useTournamentStore((s) => s.startLadder);
  const recordResult = useTournamentStore((s) => s.recordResult);
  const retire = useTournamentStore((s) => s.retire);
  const reset = useTournamentStore((s) => s.reset);

  const [boardSize, setBoardSize] = useState<BoardSize>(9);
  const [userColor, setUserColor] = useState<Player>('black');
  const [startKyu, setStartKyu] = useState<number>(12);

  const isActive = ladder?.status === 'active';

  const handleStart = () => {
    startLadder({ boardSize, userColor, komi: KOMI, handicap: 0, startKyu });
  };

  const statClass = 'rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-center';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-3 mobile-safe-inset mobile-safe-area-bottom"
      onClick={onClose}
    >
      <div
        className="ui-panel flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tournament-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ui-bar flex items-center justify-between border-b border-[var(--ui-border)] px-4 py-3">
          <h2 id="tournament-title" className="inline-flex items-center gap-2 text-lg font-semibold text-[var(--ui-text)]">
            <FaTrophy aria-hidden="true" /> Rank Ladder
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="ui-control grid place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
            aria-label="Close ladder"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {isActive && ladder ? (
            <>
              <p className="text-sm text-[var(--ui-text-muted)]">
                Climb the ranks: beat each opponent to face a stronger one. Lose and you stay to try again.
              </p>

              <div className="rounded-lg border border-[var(--ui-accent)] bg-[var(--ui-accent-soft,var(--ui-surface-2))] p-4 text-center">
                <div className="text-xs uppercase tracking-wide text-[var(--ui-text-muted)]">Next opponent</div>
                <div className="text-3xl font-bold text-[var(--ui-text)]">{formatKyuRank(ladder.currentKyu)}</div>
                <div className="text-xs text-[var(--ui-text-muted)]">
                  {ladder.boardSize}×{ladder.boardSize} · you play {ladder.userColor}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-sm text-[var(--ui-text)]">
                <div className={statClass}>
                  <div className="text-lg font-semibold">{ladder.wins}–{ladder.losses}</div>
                  <div className="text-xs text-[var(--ui-text-muted)]">W–L</div>
                </div>
                <div className={statClass}>
                  <div className="text-lg font-semibold">{ladder.streak}</div>
                  <div className="text-xs text-[var(--ui-text-muted)]">Win streak</div>
                </div>
                <div className={statClass}>
                  <div className="text-lg font-semibold">
                    {Number.isFinite(ladder.bestKyu) ? formatKyuRank(ladder.bestKyu) : '—'}
                  </div>
                  <div className="text-xs text-[var(--ui-text-muted)]">Best beaten</div>
                </div>
              </div>

              {ladder.awaitingResult ? (
                <div className="space-y-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3 text-sm">
                  <div className="font-semibold text-[var(--ui-text)]">Game in progress vs {formatKyuRank(ladder.currentKyu)}</div>
                  <p className="text-[var(--ui-text-muted)]">
                    Resign results are detected automatically. If you counted the game out, report it below.
                  </p>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => recordResult('win')}
                      className="min-h-11 rounded-lg border border-[var(--ui-success,#38a169)] bg-[var(--ui-surface)] px-3 py-2 font-semibold text-[var(--ui-success,#38a169)] hover:bg-[var(--ui-surface-2)]"
                    >
                      I won
                    </button>
                    <button
                      type="button"
                      onClick={() => recordResult('loss')}
                      className="min-h-11 rounded-lg border border-[var(--ui-danger)] bg-[var(--ui-surface)] px-3 py-2 font-semibold text-[var(--ui-danger)] hover:bg-[var(--ui-surface-2)]"
                    >
                      I lost
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="mt-1 w-full text-center text-xs text-[var(--ui-text-muted)] underline hover:text-[var(--ui-text)]"
                  >
                    Resume game
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              {ladder && ladder.status === 'ended' && (
                <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3 text-sm text-[var(--ui-text)]">
                  <div className="font-semibold">Run complete</div>
                  <div className="text-[var(--ui-text-muted)]">
                    Record {ladder.wins}–{ladder.losses}. Strongest opponent beaten:{' '}
                    {Number.isFinite(ladder.bestKyu) ? formatKyuRank(ladder.bestKyu) : '—'}.
                  </div>
                </div>
              )}
              <p className="text-sm text-[var(--ui-text-muted)]">
                Play a series of calibrated bots that get one rank stronger every time you win. How high can you climb?
              </p>

              <div className="space-y-3">
                <div>
                  <div className="mb-1 text-sm font-semibold text-[var(--ui-text)]">Board size</div>
                  <div className="grid grid-cols-3 gap-2">
                    {BOARD_OPTIONS.map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setBoardSize(sz)}
                        className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold ${
                          boardSize === sz
                            ? 'border-[var(--ui-accent)] bg-[var(--ui-accent-soft,var(--ui-surface-2))] text-[var(--ui-text)]'
                            : 'border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)]'
                        }`}
                      >
                        {sz}×{sz}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-sm font-semibold text-[var(--ui-text)]">Your color</div>
                  <div className="grid grid-cols-2 gap-2">
                    {(['black', 'white'] as Player[]).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setUserColor(c)}
                        className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold capitalize ${
                          userColor === c
                            ? 'border-[var(--ui-accent)] bg-[var(--ui-accent-soft,var(--ui-surface-2))] text-[var(--ui-text)]'
                            : 'border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)]'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-[var(--ui-text)]">Starting opponent</span>
                  <select
                    value={startKyu}
                    onChange={(e) => setStartKyu(Number(e.target.value))}
                    className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-sm text-[var(--ui-text)]"
                  >
                    {RANK_OPTIONS.map((kyu) => (
                      <option key={kyu} value={kyu}>{formatKyuRank(kyu)}</option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          )}
        </div>

        <div className="ui-bar flex flex-wrap justify-end gap-2 border-t border-[var(--ui-border)] px-4 py-3">
          {isActive && ladder ? (
            <>
              <button
                type="button"
                onClick={retire}
                className="min-h-11 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-2 text-sm font-semibold text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)]"
              >
                <span className="inline-flex items-center gap-2"><FaFlag aria-hidden="true" /> Retire</span>
              </button>
              {!ladder.awaitingResult && (
                <button
                  type="button"
                  onClick={() => onPlayGame(ladder)}
                  className="min-h-11 rounded-lg border border-[var(--ui-accent)] bg-[var(--ui-accent-soft,var(--ui-surface-2))] px-4 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]"
                >
                  <span className="inline-flex items-center gap-2">
                    <FaPlay aria-hidden="true" /> Play vs {formatKyuRank(ladder.currentKyu)}
                  </span>
                </button>
              )}
            </>
          ) : (
            <>
              {ladder && (
                <button
                  type="button"
                  onClick={reset}
                  className="min-h-11 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-2 text-sm font-semibold text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)]"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={handleStart}
                className="min-h-11 rounded-lg border border-[var(--ui-accent)] bg-[var(--ui-accent-soft,var(--ui-surface-2))] px-4 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]"
              >
                <span className="inline-flex items-center gap-2"><FaTrophy aria-hidden="true" /> Start ladder</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

TournamentModal.displayName = 'TournamentModal';
