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
  makeAiMove: () => void;
  currentPlayer: Player;
  moveHistory: Move[];
  isInsertMode: boolean;
  passPolicyColor: string | null;
  passPv: { idx: number; player: Player } | null;
  jumpBack: (n: number) => void;
  jumpForward: (n: number) => void;
}

export const BottomControlBar: React.FC<BottomControlBarProps> = ({
  passTurn,
  navigateBack,
  navigateForward,
  navigateStart,
  navigateEnd,
  findMistake,
  rotateBoard,
  makeAiMove,
  currentPlayer,
  moveHistory,
  isInsertMode,
  passPolicyColor,
  passPv,
  jumpBack,
  jumpForward,
}) => {
  const passBtnRef = useRef<HTMLButtonElement>(null);
  const [passBtnHeight, setPassBtnHeight] = useState(0);

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

  return (
    <div className="h-16 bg-slate-800 border-t border-slate-700/50 flex items-center px-3 justify-between select-none">
      <div className="relative">
        {passPolicyColor && (
          <div
            className="absolute inset-y-0 left-1/2 -translate-x-1/2 pointer-events-none rounded-full"
            style={{ height: '100%', aspectRatio: '1 / 1', backgroundColor: passPolicyColor }}
          />
        )}
        <button
          ref={passBtnRef}
          className="relative px-4 py-2 bg-slate-700/80 hover:bg-slate-600/80 rounded-lg text-sm font-medium text-slate-200"
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

      <div className="flex items-center gap-1">
        <IconButton
          title="Previous mistake (N)"
          onClick={() => findMistake('undo')}
          disabled={isInsertMode}
          className="text-red-300"
        >
          <FaExclamationTriangle />
        </IconButton>
        <IconButton title="Start (Home)" onClick={navigateStart} disabled={isInsertMode}>
          <FaStepBackward />
        </IconButton>
        <IconButton title="Back 10 (Shift+←)" onClick={() => jumpBack(10)} disabled={isInsertMode}>
          <FaFastBackward />
        </IconButton>
        <IconButton title="Back (←)" onClick={navigateBack}>
          <FaChevronLeft />
        </IconButton>

        <div className="px-3 text-sm text-slate-300 font-mono flex items-center gap-2">
          <span className={currentPlayer === 'black' ? 'text-white' : 'text-slate-500'}>B</span>
          <span className="text-slate-500">·</span>
          <span className={currentPlayer === 'white' ? 'text-white' : 'text-slate-500'}>W</span>
          <span className="text-slate-500 ml-2">Move</span>
          <span className="text-white">{moveHistory.length}</span>
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
        <IconButton
          title="Next mistake (Shift+N)"
          onClick={() => findMistake('redo')}
          disabled={isInsertMode}
          className="text-red-300"
        >
          <FaExclamationTriangle />
        </IconButton>
        <IconButton title="Rotate (O)" onClick={rotateBoard}>
          <FaSyncAlt />
        </IconButton>
      </div>

      <button
        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium text-white shadow-lg shadow-emerald-600/20"
        onClick={() => makeAiMove()}
        aria-label="Make AI move"
        title="AI move (Enter)"
      >
        AI Move
      </button>
    </div>
  );
};
