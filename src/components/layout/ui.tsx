import React, { useState } from 'react';
import { FaChevronDown, FaChevronLeft, FaChevronRight, FaChevronUp } from 'react-icons/fa';

export function rgba(color: readonly [number, number, number, number], alphaOverride?: number): string {
  const a = typeof alphaOverride === 'number' ? alphaOverride : color[3];
  return `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)}, ${a})`;
}

// Parse title like "Back (←)" into { label: "Back", shortcut: "←" }
function parseTitle(title: string): { label: string; shortcut?: string } {
  const match = title.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (match) {
    return { label: match[1]!.trim(), shortcut: match[2]!.trim() };
  }
  return { label: title };
}

export const Tooltip: React.FC<{
  label: string;
  shortcut?: string;
  visible: boolean;
  position?: 'top' | 'bottom';
}> = ({ label, shortcut, visible, position = 'bottom' }) => {
  if (!visible) return null;

  const positionClasses = position === 'top'
    ? 'bottom-full mb-2'
    : 'top-full mt-2';

  return (
    <div
      className={`absolute left-1/2 -translate-x-1/2 ${positionClasses} z-50 pointer-events-none`}
      role="tooltip"
    >
      <div className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
        <div className="text-sm text-slate-200">{label}</div>
        {shortcut && (
          <div className="mt-1 flex justify-center">
            <kbd className="px-2 py-0.5 bg-slate-700 rounded text-xs font-mono text-slate-300">
              {shortcut}
            </kbd>
          </div>
        )}
      </div>
    </div>
  );
};

export const IconButton: React.FC<{
  title: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ title, onClick, disabled, className, children }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const { label, shortcut } = parseTitle(title);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        className={[
          'h-10 w-10 flex items-center justify-center rounded-lg transition-colors',
          disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-700/80 text-slate-300 hover:text-white active:bg-slate-700',
          className ?? '',
        ].join(' ')}
      >
        {children}
      </button>
      <Tooltip label={label} shortcut={shortcut} visible={showTooltip && !disabled} />
    </div>
  );
};

export const TogglePill: React.FC<{
  label: string;
  shortcut?: string;
  active: boolean;
  disabled?: boolean;
  onToggle: () => void;
}> = ({ label, shortcut, active, disabled, onToggle }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        aria-label={`${active ? 'Hide' : 'Show'} ${label}`}
        aria-pressed={active}
        className={[
          'px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all border',
          disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-700/50',
          active
            ? 'bg-slate-700/80 text-white border-slate-600/50 shadow-sm'
            : 'bg-slate-800/50 text-slate-400 border-slate-700/30',
        ].join(' ')}
      >
        <span
          className={[
            'inline-block h-2 w-2 rounded-full',
            active ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-slate-600',
          ].join(' ')}
          aria-hidden="true"
        />
        <span className="whitespace-nowrap">{shortcut ? `${shortcut} ${label}` : label}</span>
      </button>
      <Tooltip
        label={`${active ? 'Hide' : 'Show'} ${label}`}
        shortcut={shortcut}
        visible={showTooltip && !disabled}
      />
    </div>
  );
};

export const EngineStatusBadge: React.FC<{
  label: string | null;
  title?: string;
  dotClass: string;
  tone?: 'default' | 'error';
  variant?: 'pill' | 'inline';
  showErrorTag?: boolean;
  className?: string;
  maxWidthClassName?: string;
}> = ({
  label,
  title,
  dotClass,
  tone = 'default',
  variant = 'pill',
  showErrorTag = false,
  className,
  maxWidthClassName,
}) => {
  if (!label) return null;
  const toneClasses = tone === 'error'
    ? 'bg-rose-900/30 border-rose-600/50 text-rose-200'
    : 'bg-slate-900/50 border-slate-700/50 text-slate-300';
  const baseClasses = variant === 'pill'
    ? `items-center gap-1.5 px-2.5 py-1 rounded text-xs border ${toneClasses}`
    : 'items-center gap-1.5 text-xs text-slate-400';

  return (
    <div
      className={['flex', baseClasses, className ?? ''].join(' ')}
      title={title}
    >
      <span className={['inline-block h-2 w-2 rounded-full', dotClass].join(' ')} />
      <span className={['truncate', maxWidthClassName ?? ''].join(' ')}>
        {label}
      </span>
      {showErrorTag && <span className="text-[10px] uppercase tracking-wide font-semibold">error</span>}
    </div>
  );
};

export const PanelHeaderButton: React.FC<{
  label: string;
  colorClass: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, colorClass, active, onClick }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        aria-label={`${active ? 'Hide' : 'Show'} ${label}`}
        aria-pressed={active}
        className={[
          'px-2 py-1 rounded text-xs font-semibold border',
          active ? `${colorClass} border-slate-500 text-white` : 'bg-slate-900 border-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700',
        ].join(' ')}
      >
        {label}
      </button>
      <Tooltip
        label={`${active ? 'Hide' : 'Show'} ${label}`}
        visible={showTooltip}
      />
    </div>
  );
};

export function formatMoveLabel(x: number, y: number): string {
  if (x < 0 || y < 0) return 'Pass';
  const col = String.fromCharCode(65 + (x >= 8 ? x + 1 : x));
  const row = 19 - y;
  return `${col}${row}`;
}

export function playerToShort(p: 'black' | 'white'): string {
  return p === 'black' ? 'B' : 'W';
}

export const panelCardBase = 'rounded-xl border transition-colors';
export const panelCardOpen = 'border-slate-700/50 bg-slate-900/60 p-2 shadow-sm';
export const panelCardClosed = 'border-transparent bg-transparent p-1';

export const SectionHeader: React.FC<{
  title: string;
  open: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
}> = ({ title, open, onToggle, actions }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 py-2">
    <button
      type="button"
      className="text-sm font-semibold text-slate-200 hover:text-white flex items-center gap-2 transition-colors py-1 -ml-1 pl-1 pr-2 rounded hover:bg-slate-700/30"
      onClick={onToggle}
    >
      {open ? <FaChevronDown size={12} className="text-slate-400" /> : <FaChevronRight size={12} className="text-slate-400" />}
      {title}
    </button>
    {actions ? <div className="flex flex-wrap items-center gap-1.5">{actions}</div> : null}
  </div>
);

export const PanelEdgeToggle: React.FC<{
  side: 'left' | 'right' | 'top' | 'bottom';
  state: 'open' | 'closed';
  title: string;
  onClick: () => void;
  className?: string;
}> = ({ side, state, title, onClick, className }) => {
  const isLeft = side === 'left';
  const isRight = side === 'right';
  const isTop = side === 'top';
  const isVertical = isLeft || isRight;
  const isOpen = state === 'open';
  const icon = isLeft
    ? (isOpen ? <FaChevronLeft size={14} /> : <FaChevronRight size={14} />)
    : isRight
      ? (isOpen ? <FaChevronRight size={14} /> : <FaChevronLeft size={14} />)
      : isTop
        ? (isOpen ? <FaChevronUp size={14} /> : <FaChevronDown size={14} />)
        : (isOpen ? <FaChevronDown size={14} /> : <FaChevronUp size={14} />);
  const edgeClasses = isLeft
    ? 'border-r border-slate-700/50 rounded-r-lg'
    : isRight
      ? 'border-l border-slate-700/50 rounded-l-lg'
      : isTop
        ? 'border-b border-slate-700/50 rounded-b-lg'
        : 'border-t border-slate-700/50 rounded-t-lg';
  const sizeClasses = isVertical ? 'h-20 w-8' : 'w-20 h-8';

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={[
        sizeClasses,
        'bg-slate-800/90 hover:bg-slate-700/90 flex items-center justify-center text-slate-300 hover:text-white transition-all shadow-lg',
        edgeClasses,
        className ?? '',
      ].join(' ')}
    >
      {icon}
    </button>
  );
};
