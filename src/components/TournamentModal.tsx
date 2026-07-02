import React, { useState } from 'react';
import { FaTimes, FaTrophy, FaPlay, FaFlag, FaBolt } from 'react-icons/fa';
import { KOMI, type BoardSize, type Player } from '../types';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useTournamentStore } from '../store/tournamentStore';
import { formatKyuRank, type LadderState } from '../utils/tournament';
import {
  GAUNTLET_PRESETS,
  GAUNTLET_ROUNDS,
  buildGauntletOpponents,
  currentGauntletOpponentKyu,
  type GauntletPreset,
  type GauntletState,
} from '../utils/gauntlet';

interface TournamentModalProps {
  onClose: () => void;
  /** Set up and start the live game for the current ladder rung, then close the modal. */
  onPlayGame: (ladder: LadderState) => void;
  /** Set up and start the live game for the current gauntlet round, then close the modal. */
  onPlayGauntletGame: (gauntlet: GauntletState) => void;
}

type Mode = 'ladder' | 'gauntlet';

const BOARD_OPTIONS: BoardSize[] = [9, 13, 19];
const RANK_OPTIONS = [18, 15, 12, 10, 8, 5, 3, 1, 0, -2, -4];

const statClass = 'rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-center';
const boardButtonClass = (active: boolean) =>
  `min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold ${
    active
      ? 'border-[var(--ui-accent)] bg-[var(--ui-accent-soft,var(--ui-surface-2))] text-[var(--ui-text)]'
      : 'border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)]'
  }`;

export const TournamentModal: React.FC<TournamentModalProps> = ({ onClose, onPlayGame, onPlayGauntletGame }) => {
  useEscapeToClose(onClose);

  const ladder = useTournamentStore((s) => s.ladder);
  const startLadder = useTournamentStore((s) => s.startLadder);
  const recordResult = useTournamentStore((s) => s.recordResult);
  const retire = useTournamentStore((s) => s.retire);
  const reset = useTournamentStore((s) => s.reset);
  const gauntlet = useTournamentStore((s) => s.gauntlet);
  const startGauntlet = useTournamentStore((s) => s.startGauntlet);
  const recordGauntletResult = useTournamentStore((s) => s.recordGauntletResult);
  const resetGauntlet = useTournamentStore((s) => s.resetGauntlet);

  const [mode, setMode] = useState<Mode>(gauntlet && gauntlet.status === 'active' && (!ladder || ladder.status !== 'active') ? 'gauntlet' : 'ladder');
  const [boardSize, setBoardSize] = useState<BoardSize>(9);
  const [userColor, setUserColor] = useState<Player>('black');
  const [startKyu, setStartKyu] = useState<number>(12);
  const [preset, setPreset] = useState<GauntletPreset>('match');

  const isLadderActive = ladder?.status === 'active';
  const isGauntletActive = gauntlet?.status === 'active';

  const handleStartLadder = () => {
    startLadder({ boardSize, userColor, komi: KOMI, handicap: 0, startKyu });
  };
  const handleStartGauntlet = () => {
    startGauntlet({ boardSize, userColor, komi: KOMI, handicap: 0, baseKyu: startKyu, preset });
  };

  const previewOpponents = buildGauntletOpponents(startKyu, preset);

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
            <FaTrophy aria-hidden="true" /> Play a series
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="ui-control grid place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
            aria-label="Close series"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-[var(--ui-border)] px-4 pt-3">
          {(['ladder', 'gauntlet'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={[
                'rounded-t-lg px-3 py-2 text-sm font-semibold capitalize',
                mode === m
                  ? 'bg-[var(--ui-accent-soft,var(--ui-surface-2))] text-[var(--ui-accent)]'
                  : 'text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]',
              ].join(' ')}
            >
              {m === 'ladder' ? 'Rank ladder' : 'Gauntlet'}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {mode === 'ladder' ? (
            isLadderActive && ladder ? (
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
                {renderSetup()}
              </>
            )
          ) : isGauntletActive && gauntlet ? (
            <>
              <p className="text-sm text-[var(--ui-text-muted)]">
                Four games. Lose any one and the gauntlet ends. Win all four to clear it.
              </p>
              <div className="flex items-center justify-center gap-2">
                {gauntlet.opponents.map((kyu, i) => {
                  const done = i < gauntlet.index;
                  const current = i === gauntlet.index && gauntlet.status === 'active';
                  return (
                    <div
                      key={i}
                      className={[
                        'flex h-14 w-14 flex-col items-center justify-center rounded-full border text-sm font-semibold',
                        done
                          ? 'border-[var(--ui-success,#38a169)] bg-[var(--ui-success,#38a169)]/15 text-[var(--ui-success,#38a169)]'
                          : current
                            ? 'border-[var(--ui-accent)] bg-[var(--ui-accent-soft,var(--ui-surface-2))] text-[var(--ui-text)]'
                            : 'border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text-muted)]',
                      ].join(' ')}
                    >
                      <span className="text-[10px] uppercase">{done ? 'Won' : `G${i + 1}`}</span>
                      <span>{formatKyuRank(kyu)}</span>
                    </div>
                  );
                })}
              </div>
              <div className="text-center text-sm text-[var(--ui-text-muted)]">
                {gauntlet.boardSize}×{gauntlet.boardSize} · you play {gauntlet.userColor} · {gauntlet.wins}/{GAUNTLET_ROUNDS} won
              </div>
              {gauntlet.awaitingResult ? (
                <div className="space-y-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3 text-sm">
                  <div className="font-semibold text-[var(--ui-text)]">Game in progress vs {formatKyuRank(currentGauntletOpponentKyu(gauntlet))}</div>
                  <p className="text-[var(--ui-text-muted)]">Resign results are detected automatically; report a counted game below.</p>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => recordGauntletResult('win')}
                      className="min-h-11 rounded-lg border border-[var(--ui-success,#38a169)] bg-[var(--ui-surface)] px-3 py-2 font-semibold text-[var(--ui-success,#38a169)] hover:bg-[var(--ui-surface-2)]"
                    >
                      I won
                    </button>
                    <button
                      type="button"
                      onClick={() => recordGauntletResult('loss')}
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
              {gauntlet && gauntlet.status !== 'active' && (
                <div
                  className={[
                    'rounded-lg border p-3 text-sm',
                    gauntlet.status === 'won'
                      ? 'border-[var(--ui-success,#38a169)] bg-[var(--ui-success,#38a169)]/10 text-[var(--ui-text)]'
                      : 'border-[var(--ui-danger)] bg-[var(--ui-surface-2)] text-[var(--ui-text)]',
                  ].join(' ')}
                >
                  <div className="font-semibold">{gauntlet.status === 'won' ? 'Gauntlet cleared! 🏆' : 'Gauntlet ended'}</div>
                  <div className="text-[var(--ui-text-muted)]">Won {gauntlet.wins} of {GAUNTLET_ROUNDS} games.</div>
                </div>
              )}
              <p className="text-sm text-[var(--ui-text-muted)]">
                A four-game gauntlet. Pick a difficulty and try to run the table — one loss ends it.
              </p>
              {renderSetup()}
              <div>
                <div className="mb-1 text-sm font-semibold text-[var(--ui-text)]">Difficulty</div>
                <div className="grid gap-2">
                  {GAUNTLET_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setPreset(p.value)}
                      className={[
                        'rounded-lg border px-3 py-2 text-left',
                        preset === p.value
                          ? 'border-[var(--ui-accent)] bg-[var(--ui-accent-soft,var(--ui-surface-2))]'
                          : 'border-[var(--ui-border)] bg-[var(--ui-surface)] hover:bg-[var(--ui-surface-2)]',
                      ].join(' ')}
                    >
                      <div className="text-sm font-semibold text-[var(--ui-text)]">{p.label}</div>
                      <div className="text-xs text-[var(--ui-text-muted)]">{p.detail}</div>
                    </button>
                  ))}
                </div>
                <div className="mt-2 text-center text-xs text-[var(--ui-text-muted)]">
                  Opponents: {previewOpponents.map((k) => formatKyuRank(k)).join(' → ')}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="ui-bar flex flex-wrap justify-end gap-2 border-t border-[var(--ui-border)] px-4 py-3">
          {mode === 'ladder' ? (
            isLadderActive && ladder ? (
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
                  onClick={handleStartLadder}
                  className="min-h-11 rounded-lg border border-[var(--ui-accent)] bg-[var(--ui-accent-soft,var(--ui-surface-2))] px-4 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]"
                >
                  <span className="inline-flex items-center gap-2"><FaTrophy aria-hidden="true" /> Start ladder</span>
                </button>
              </>
            )
          ) : isGauntletActive && gauntlet ? (
            <>
              <button
                type="button"
                onClick={resetGauntlet}
                className="min-h-11 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-2 text-sm font-semibold text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)]"
              >
                <span className="inline-flex items-center gap-2"><FaFlag aria-hidden="true" /> Give up</span>
              </button>
              {!gauntlet.awaitingResult && (
                <button
                  type="button"
                  onClick={() => onPlayGauntletGame(gauntlet)}
                  className="min-h-11 rounded-lg border border-[var(--ui-accent)] bg-[var(--ui-accent-soft,var(--ui-surface-2))] px-4 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]"
                >
                  <span className="inline-flex items-center gap-2">
                    <FaPlay aria-hidden="true" /> Play game {gauntlet.index + 1} vs {formatKyuRank(currentGauntletOpponentKyu(gauntlet))}
                  </span>
                </button>
              )}
            </>
          ) : (
            <>
              {gauntlet && (
                <button
                  type="button"
                  onClick={resetGauntlet}
                  className="min-h-11 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-2 text-sm font-semibold text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)]"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={handleStartGauntlet}
                className="min-h-11 rounded-lg border border-[var(--ui-accent)] bg-[var(--ui-accent-soft,var(--ui-surface-2))] px-4 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]"
              >
                <span className="inline-flex items-center gap-2"><FaBolt aria-hidden="true" /> Start gauntlet</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  function renderSetup() {
    return (
      <div className="space-y-3">
        <div>
          <div className="mb-1 text-sm font-semibold text-[var(--ui-text)]">Board size</div>
          <div className="grid grid-cols-3 gap-2">
            {BOARD_OPTIONS.map((sz) => (
              <button key={sz} type="button" onClick={() => setBoardSize(sz)} className={boardButtonClass(boardSize === sz)}>
                {sz}×{sz}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 text-sm font-semibold text-[var(--ui-text)]">Your color</div>
          <div className="grid grid-cols-2 gap-2">
            {(['black', 'white'] as Player[]).map((c) => (
              <button key={c} type="button" onClick={() => setUserColor(c)} className={`${boardButtonClass(userColor === c)} capitalize`}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-[var(--ui-text)]">
            {mode === 'gauntlet' ? 'Your rank' : 'Starting opponent'}
          </span>
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
    );
  }
};

TournamentModal.displayName = 'TournamentModal';
