import React, { useEffect, useRef, useState } from 'react';
import {
  FaExclamationTriangle,
  FaStepBackward,
  FaFastBackward,
  FaChevronLeft,
  FaChevronRight,
  FaFastForward,
  FaStepForward,
  FaSyncAlt,
  FaEllipsisH,
  FaUndo,
  FaRobot,
  FaFlag,
} from 'react-icons/fa';
import type { Player, Move } from '../../types';
import { IconButton } from './ui';
import { STONE_SIZE } from './types';
import { publicUrl } from '../../utils/publicUrl';

interface BottomControlBarProps {
  passTurn: () => void;
  navigateBack: () => void;
  navigateForward: () => void;
  navigateStart: () => void;
  navigateEnd: () => void;
  findMistake: (dir: 'undo' | 'redo') => void;
  rotateBoard: () => void;
  currentPlayer: Player;
  moveHistory: Move[];
  boardSize: number;
  handicap: number;
  isInsertMode: boolean;
  passPolicyColor: string | null;
  passPv: { idx: number; player: Player } | null;
  jumpBack: (n: number) => void;
  jumpForward: (n: number) => void;
  isMobile?: boolean;
  onUndo?: () => void;
  onAiMove?: () => void;
  onResign?: () => void;
}

export const BottomControlBar: React.FC<BottomControlBarProps> = ({
  passTurn,
  navigateBack,
  navigateForward,
  navigateStart,
  navigateEnd,
  findMistake,
  rotateBoard,
  currentPlayer,
  moveHistory,
  boardSize,
  handicap,
  isInsertMode,
  passPolicyColor,
  passPv,
  jumpBack,
  jumpForward,
  isMobile = false,
  onUndo,
  onAiMove,
  onResign,
}) => {
  const passBtnRef = useRef<HTMLButtonElement>(null);
  const [passBtnHeight, setPassBtnHeight] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const el = passBtnRef.current;
    if (!el) return;
    const update = () => setPassBtnHeight(el.getBoundingClientRect().height);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(() => update());
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-bottom-more]')) return;
      setMoreOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [moreOpen]);

  if (isMobile) {
    return (
      <div className="ui-bar ui-bar-height ui-bar-pad border-t flex items-center gap-1.5 sm:gap-2 select-none">
        <div className="relative">
          {passPolicyColor && (
            <div
              className="absolute inset-y-0 left-1/2 -translate-x-1/2 pointer-events-none rounded-full"
              style={{ height: '100%', aspectRatio: '1 / 1', backgroundColor: passPolicyColor }}
            />
          )}
          <button
            ref={passBtnRef}
            className="relative px-2.5 py-1.5 sm:px-3 sm:py-2 bg-[var(--ui-surface-2)] hover:brightness-110 rounded-lg text-[11px] sm:text-xs font-medium text-[var(--ui-text)] transition-colors"
            onClick={passTurn}
            aria-label="Pass turn"
            title="Pass (P)"
          >
            Pass
          </button>
          {passPv && (
            <div
              className="absolute pointer-events-none flex items-center justify-center"
              style={{
                left: '100%',
                top: '50%',
                width: passBtnHeight > 0 ? passBtnHeight : 32,
                height: passBtnHeight > 0 ? passBtnHeight : 32,
                transform: 'translate(0, -50%)',
                zIndex: 20,
              }}
            >
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `url('${publicUrl(`katrain/${passPv.player === 'black' ? 'B_stone.png' : 'W_stone.png'}`)}')`,
                  backgroundSize: 'contain',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                }}
              />
              <div
                className="font-bold"
                style={{
                  color: passPv.player === 'black' ? 'white' : 'black',
                  fontSize: passBtnHeight > 0 ? passBtnHeight / (2 * STONE_SIZE * 1.55) : 12,
                  lineHeight: 1,
                }}
              >
                {passPv.idx}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 flex items-center justify-center gap-1">
          <IconButton title="Back (←)" onClick={navigateBack} disabled={isInsertMode}>
            <FaChevronLeft />
          </IconButton>
          <div className="mobile-bottom-meta px-2 py-1 rounded-md bg-[var(--ui-surface)] border border-[var(--ui-border)] text-[10px] sm:text-xs font-mono text-[var(--ui-text-muted)] flex items-center gap-1">
            <span className={['mobile-bottom-meta-player', currentPlayer === 'black' ? 'text-white font-semibold' : 'text-slate-500'].join(' ')}>B</span>
            <span className="mobile-bottom-meta-divider text-slate-600">·</span>
            <span className={['mobile-bottom-meta-player', currentPlayer === 'white' ? 'text-white font-semibold' : 'text-slate-500'].join(' ')}>W</span>
            <span className="mobile-bottom-meta-divider text-slate-600 mx-1">|</span>
            <span className="ui-text-faint">{boardSize}×{boardSize}</span>
            {handicap > 0 && (
              <>
                <span className="mobile-bottom-meta-divider text-slate-600">·</span>
                <span className="ui-text-faint">H{handicap}</span>
              </>
            )}
            <span className="mobile-bottom-meta-divider text-slate-600 mx-1">|</span>
            <span className="ui-text-faint">#{moveHistory.length}</span>
          </div>
          <IconButton title="Forward (→)" onClick={navigateForward} disabled={isInsertMode}>
            <FaChevronRight />
          </IconButton>
        </div>

        <div className="relative" data-bottom-more>
          <IconButton title="More controls" onClick={() => setMoreOpen((prev) => !prev)}>
            <FaEllipsisH />
          </IconButton>
          {moreOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 bg-black/50 z-40 transition-opacity backdrop-blur-[2px]"
                onClick={() => setMoreOpen(false)}
                aria-hidden="true"
              />
              {/* Bottom Sheet */}
              <div className="fixed bottom-[var(--mobile-tabbar-height,60px)] left-0 right-0 max-h-[70vh] ui-panel border-t rounded-t-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.3)] overflow-y-auto z-50 overscroll-contain pb-safe animate-slide-up select-none touch-manipulation">
                <div className="sticky top-0 bg-[var(--ui-surface)]/95 backdrop-blur-md border-b border-[var(--ui-border)] px-4 py-3 flex items-center justify-between z-10">
                  <div className="text-sm font-semibold">More Controls</div>
                  <button
                    onClick={() => setMoreOpen(false)}
                    className="p-2 -mr-2 text-[var(--ui-text-muted)] hover:text-white rounded-full hover:bg-[var(--ui-surface-2)]"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M13 1L1 13M1 1L13 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>

                <div className="p-2 flex flex-col gap-1">
                  <button
                    className="w-full px-4 py-3.5 text-left hover:bg-[var(--ui-surface-2)] active:bg-[var(--ui-surface-2)] rounded-lg flex items-center gap-3 transition-colors"
                    onClick={() => {
                      navigateStart();
                      setMoreOpen(false);
                    }}
                    disabled={isInsertMode}
                  >
                    <div className="w-8 h-8 rounded-full bg-[var(--ui-surface-2)] flex items-center justify-center text-[var(--ui-text)]">
                      <FaStepBackward size={14} />
                    </div>
                    <div className="flex-1 font-medium">Start of game</div>
                  </button>

                  <button
                    className="w-full px-4 py-3.5 text-left hover:bg-[var(--ui-surface-2)] active:bg-[var(--ui-surface-2)] rounded-lg flex items-center gap-3 transition-colors"
                    onClick={() => {
                      jumpBack(10);
                      setMoreOpen(false);
                    }}
                    disabled={isInsertMode}
                  >
                    <div className="w-8 h-8 rounded-full bg-[var(--ui-surface-2)] flex items-center justify-center text-[var(--ui-text)]">
                      <FaFastBackward size={14} />
                    </div>
                    <div className="flex-1 font-medium">Back 10 moves</div>
                  </button>

                  <button
                    className="w-full px-4 py-3.5 text-left hover:bg-[var(--ui-surface-2)] active:bg-[var(--ui-surface-2)] rounded-lg flex items-center gap-3 transition-colors"
                    onClick={() => {
                      jumpForward(10);
                      setMoreOpen(false);
                    }}
                    disabled={isInsertMode}
                  >
                    <div className="w-8 h-8 rounded-full bg-[var(--ui-surface-2)] flex items-center justify-center text-[var(--ui-text)]">
                      <FaFastForward size={14} />
                    </div>
                    <div className="flex-1 font-medium">Forward 10 moves</div>
                  </button>

                  <button
                    className="w-full px-4 py-3.5 text-left hover:bg-[var(--ui-surface-2)] active:bg-[var(--ui-surface-2)] rounded-lg flex items-center gap-3 transition-colors"
                    onClick={() => {
                      navigateEnd();
                      setMoreOpen(false);
                    }}
                    disabled={isInsertMode}
                  >
                    <div className="w-8 h-8 rounded-full bg-[var(--ui-surface-2)] flex items-center justify-center text-[var(--ui-text)]">
                      <FaStepForward size={14} />
                    </div>
                    <div className="flex-1 font-medium">End of game</div>
                  </button>

                  <div className="h-px bg-[var(--ui-border)] mx-2 my-1" />

                  {onUndo && (
                    <button
                      className="w-full px-4 py-3.5 text-left hover:bg-[var(--ui-surface-2)] active:bg-[var(--ui-surface-2)] rounded-lg flex items-center gap-3 transition-colors"
                      onClick={() => {
                        onUndo();
                        setMoreOpen(false);
                      }}
                    >
                      <div className="w-8 h-8 rounded-full bg-[var(--ui-surface-2)] flex items-center justify-center text-[var(--ui-text)]">
                        <FaUndo size={14} />
                      </div>
                      <div className="flex-1 font-medium">Undo last move</div>
                    </button>
                  )}

                  {onAiMove && (
                    <button
                      className="w-full px-4 py-3.5 text-left hover:bg-[var(--ui-surface-2)] active:bg-[var(--ui-surface-2)] rounded-lg flex items-center gap-3 transition-colors"
                      onClick={() => {
                        onAiMove();
                        setMoreOpen(false);
                      }}
                    >
                      <div className="w-8 h-8 rounded-full bg-[var(--ui-surface-2)] flex items-center justify-center text-teal-400">
                        <FaRobot size={14} />
                      </div>
                      <div className="flex-1 font-medium text-teal-400">Request AI move</div>
                    </button>
                  )}

                  {onResign && (
                    <button
                      className="w-full px-4 py-3.5 text-left hover:bg-rose-950/30 active:bg-rose-950/30 rounded-lg flex items-center gap-3 transition-colors text-rose-500"
                      onClick={() => {
                        onResign();
                        setMoreOpen(false);
                      }}
                    >
                      <div className="w-8 h-8 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500">
                        <FaFlag size={14} />
                      </div>
                      <div className="flex-1 font-medium">Resign</div>
                    </button>
                  )}

                  <div className="h-px bg-[var(--ui-border)] mx-2 my-1" />

                  <button
                    className="w-full px-4 py-3.5 text-left hover:bg-amber-950/30 active:bg-amber-950/30 rounded-lg flex items-center gap-3 transition-colors text-amber-500"
                    onClick={() => {
                      findMistake('undo');
                      setMoreOpen(false);
                    }}
                    disabled={isInsertMode}
                  >
                    <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
                      <FaExclamationTriangle size={14} />
                    </div>
                    <div className="flex-1 font-medium">Previous mistake</div>
                  </button>

                  <button
                    className="w-full px-4 py-3.5 text-left hover:bg-amber-950/30 active:bg-amber-950/30 rounded-lg flex items-center gap-3 transition-colors text-amber-500"
                    onClick={() => {
                      findMistake('redo');
                      setMoreOpen(false);
                    }}
                    disabled={isInsertMode}
                  >
                    <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
                      <FaExclamationTriangle size={14} />
                    </div>
                    <div className="flex-1 font-medium">Next mistake</div>
                  </button>

                  <div className="h-px bg-[var(--ui-border)] mx-2 my-1" />

                  <button
                    className="w-full px-4 py-3.5 text-left hover:bg-[var(--ui-surface-2)] active:bg-[var(--ui-surface-2)] rounded-lg flex items-center gap-3 transition-colors"
                    onClick={() => {
                      rotateBoard();
                      setMoreOpen(false);
                    }}
                  >
                    <div className="w-8 h-8 rounded-full bg-[var(--ui-surface-2)] flex items-center justify-center text-[var(--ui-text)]">
                      <FaSyncAlt size={14} />
                    </div>
                    <div className="flex-1 font-medium">Rotate Board</div>
                  </button>

                  {/* Bottom padding for safe area */}
                  <div className="h-4" />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="ui-bar ui-bar-height ui-bar-pad border-t flex items-center gap-3 select-none">
      <div className="relative">
        {passPolicyColor && (
          <div
            className="absolute inset-y-0 left-1/2 -translate-x-1/2 pointer-events-none rounded-full"
            style={{ height: '100%', aspectRatio: '1 / 1', backgroundColor: passPolicyColor }}
          />
        )}
        <button
          ref={passBtnRef}
          className="relative px-4 py-2 bg-[var(--ui-surface-2)] hover:brightness-110 rounded-lg text-sm font-medium text-[var(--ui-text)] transition-colors"
          onClick={passTurn}
          aria-label="Pass turn"
          title="Pass (P)"
        >
          Pass
        </button>
        {passPv && (
          <div
            className="absolute pointer-events-none flex items-center justify-center"
            style={{
              left: '100%',
              top: '50%',
              width: passBtnHeight > 0 ? passBtnHeight : 32,
              height: passBtnHeight > 0 ? passBtnHeight : 32,
              transform: 'translate(0, -50%)',
              zIndex: 20,
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url('${publicUrl(`katrain/${passPv.player === 'black' ? 'B_stone.png' : 'W_stone.png'}`)}')`,
                backgroundSize: 'contain',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
              }}
            />
            <div
              className="font-bold"
              style={{
                color: passPv.player === 'black' ? 'white' : 'black',
                fontSize: passBtnHeight > 0 ? passBtnHeight / (2 * STONE_SIZE * 1.45) : 14,
                lineHeight: 1,
              }}
            >
              {passPv.idx}
            </div>
          </div>
        )}
      </div>

      {/* Navigation controls */}
      <div className="flex-1 flex items-center justify-center gap-1">
        <IconButton
          title="Previous mistake (N)"
          onClick={() => findMistake('undo')}
          disabled={isInsertMode}
          className="text-[var(--ui-danger)] hover:text-[var(--ui-danger)]"
        >
          <FaExclamationTriangle />
        </IconButton>

        <div className="h-6 w-px bg-[var(--ui-border)] mx-0.5" />

        <IconButton title="Start (Home)" onClick={navigateStart} disabled={isInsertMode}>
          <FaStepBackward />
        </IconButton>
        <IconButton title="Back 10 (Shift+←)" onClick={() => jumpBack(10)} disabled={isInsertMode}>
          <FaFastBackward />
        </IconButton>
        <IconButton title="Back (←)" onClick={navigateBack}>
          <FaChevronLeft />
        </IconButton>

        {/* Move counter */}
        <div className="px-3 py-1.5 rounded-md bg-[var(--ui-surface)] border border-[var(--ui-border)] text-sm text-[var(--ui-text-muted)] font-mono flex items-center gap-2 min-w-[120px] justify-center">
          <span className={currentPlayer === 'black' ? 'text-white font-semibold' : 'text-slate-500'}>B</span>
          <span className="text-slate-600">·</span>
          <span className={currentPlayer === 'white' ? 'text-white font-semibold' : 'text-slate-500'}>W</span>
          <span className="text-slate-600 mx-1">|</span>
          <span className="ui-text-faint">Move</span>
          <span className="text-white font-semibold">{moveHistory.length}</span>
        </div>

        <IconButton title="Forward (→)" onClick={navigateForward} disabled={isInsertMode}>
          <FaChevronRight />
        </IconButton>
        <IconButton title="Forward 10 (Shift+→)" onClick={() => jumpForward(10)} disabled={isInsertMode}>
          <FaFastForward />
        </IconButton>
        <IconButton title="End (End)" onClick={navigateEnd} disabled={isInsertMode}>
          <FaStepForward />
        </IconButton>

        <div className="h-6 w-px bg-[var(--ui-border)] mx-0.5" />

        <IconButton
          title="Next mistake (Shift+N)"
          onClick={() => findMistake('redo')}
          disabled={isInsertMode}
          className="text-[var(--ui-danger)] hover:text-[var(--ui-danger)]"
        >
          <FaExclamationTriangle />
        </IconButton>
        <IconButton title="Rotate (O)" onClick={rotateBoard}>
          <FaSyncAlt />
        </IconButton>
      </div>

    </div>
  );
};
