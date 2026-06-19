import React, { useMemo } from 'react';
import type { BoardState } from '../types';
import { getHoshiPoints, normalizeBoardSize } from '../utils/boardSize';

export type StaticBoardMarker = {
  x: number;
  y: number;
  text?: string;
  /** Marker fill color. Defaults to a translucent highlight. */
  color?: string;
  /** Text color override. */
  textColor?: string;
  kind?: 'label' | 'dot' | 'circle';
};

interface StaticBoardProps {
  board: BoardState;
  lastMove?: { x: number; y: number } | null;
  markers?: StaticBoardMarker[];
  showCoordinates?: boolean;
  /** Maximum rendered size in CSS pixels. The board scales to fit its container otherwise. */
  maxPx?: number;
  className?: string;
  ariaLabel?: string;
}

const COLUMN_LETTERS = 'ABCDEFGHJKLMNOPQRST';

/**
 * A lightweight, read-only SVG goban renderer that is decoupled from the main
 * store-driven GoBoard. Used by self-contained study tools (score quiz, lessons,
 * pro-game previews) where the live board cannot be reused.
 */
export const StaticBoard: React.FC<StaticBoardProps> = ({
  board,
  lastMove,
  markers,
  showCoordinates = false,
  maxPx = 420,
  className,
  ariaLabel = 'Go board position',
}) => {
  const size = normalizeBoardSize(board.length, 19);
  const hoshi = useMemo(() => getHoshiPoints(size), [size]);

  // Geometry: 1 unit per intersection spacing, with half-unit margins.
  const margin = showCoordinates ? 1.4 : 0.7;
  const dim = size - 1 + margin * 2;
  const cell = 1; // logical unit
  const toPx = (i: number) => margin + i * cell;
  const stoneR = 0.47;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${dim} ${dim}`}
      role="img"
      aria-label={ariaLabel}
      style={{ width: '100%', maxWidth: maxPx, height: 'auto', display: 'block', touchAction: 'none' }}
    >
      <defs>
        <radialGradient id="sb-black" cx="35%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#5a5a5a" />
          <stop offset="45%" stopColor="#1c1c1c" />
          <stop offset="100%" stopColor="#000000" />
        </radialGradient>
        <radialGradient id="sb-white" cx="35%" cy="32%" r="80%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="75%" stopColor="#ededed" />
          <stop offset="100%" stopColor="#c9c5bb" />
        </radialGradient>
      </defs>

      {/* Board surface */}
      <rect x={0} y={0} width={dim} height={dim} rx={0.3} fill="#e3b264" />

      {/* Grid lines */}
      <g stroke="#3a2a14" strokeWidth={0.03} strokeLinecap="round">
        {Array.from({ length: size }, (_, i) => (
          <React.Fragment key={`line-${i}`}>
            <line x1={toPx(0)} y1={toPx(i)} x2={toPx(size - 1)} y2={toPx(i)} />
            <line x1={toPx(i)} y1={toPx(0)} x2={toPx(i)} y2={toPx(size - 1)} />
          </React.Fragment>
        ))}
      </g>

      {/* Star points */}
      <g fill="#3a2a14">
        {hoshi.map(([hx, hy]) => (
          <circle key={`star-${hx}-${hy}`} cx={toPx(hx)} cy={toPx(hy)} r={0.08} />
        ))}
      </g>

      {/* Coordinates */}
      {showCoordinates && (
        <g fill="#5b4423" fontSize={0.42} fontFamily="system-ui, sans-serif" textAnchor="middle">
          {Array.from({ length: size }, (_, i) => (
            <React.Fragment key={`coord-${i}`}>
              <text x={toPx(i)} y={margin - 0.55} dominantBaseline="middle">{COLUMN_LETTERS[i]}</text>
              <text x={margin - 0.6} y={toPx(i)} dominantBaseline="middle">{size - i}</text>
            </React.Fragment>
          ))}
        </g>
      )}

      {/* Stones */}
      <g>
        {board.map((row, y) =>
          row.map((cellValue, x) => {
            if (!cellValue) return null;
            return (
              <circle
                key={`stone-${x}-${y}`}
                cx={toPx(x)}
                cy={toPx(y)}
                r={stoneR}
                fill={cellValue === 'black' ? 'url(#sb-black)' : 'url(#sb-white)'}
                stroke={cellValue === 'white' ? '#b8b3a7' : 'none'}
                strokeWidth={cellValue === 'white' ? 0.015 : 0}
              />
            );
          }),
        )}
      </g>

      {/* Last-move indicator */}
      {lastMove && board[lastMove.y]?.[lastMove.x] && (
        <circle
          cx={toPx(lastMove.x)}
          cy={toPx(lastMove.y)}
          r={0.18}
          fill="none"
          stroke={board[lastMove.y]![lastMove.x] === 'black' ? '#ffffff' : '#000000'}
          strokeWidth={0.06}
        />
      )}

      {/* Markers / hints */}
      {markers?.map((m, idx) => {
        const occupant = board[m.y]?.[m.x] ?? null;
        const fill = m.color ?? 'rgba(66, 153, 225, 0.85)';
        const textColor =
          m.textColor ?? (occupant === 'black' ? '#ffffff' : occupant === 'white' ? '#000000' : '#ffffff');
        if (m.kind === 'circle') {
          return (
            <circle
              key={`mk-${idx}`}
              cx={toPx(m.x)}
              cy={toPx(m.y)}
              r={stoneR - 0.06}
              fill="none"
              stroke={fill}
              strokeWidth={0.08}
            />
          );
        }
        return (
          <g key={`mk-${idx}`}>
            {!occupant && <circle cx={toPx(m.x)} cy={toPx(m.y)} r={stoneR} fill={fill} />}
            {occupant && m.kind !== 'label' && (
              <circle cx={toPx(m.x)} cy={toPx(m.y)} r={0.22} fill={fill} />
            )}
            {m.text && (
              <text
                x={toPx(m.x)}
                y={toPx(m.y)}
                fontSize={0.5}
                fontFamily="system-ui, sans-serif"
                fontWeight={700}
                fill={textColor}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {m.text}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};
