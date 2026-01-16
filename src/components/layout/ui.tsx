import React, { useState } from 'react';

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
          'h-10 w-10 flex items-center justify-center rounded',
          disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-700 text-slate-300 hover:text-white',
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
          'px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2',
          disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-700/50',
          active ? 'bg-slate-700/80 text-white' : 'bg-slate-800/50 text-slate-400',
        ].join(' ')}
      >
        <span
          className={[
            'inline-block h-2.5 w-2.5 rounded-full',
            active ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-slate-600',
          ].join(' ')}
          aria-hidden="true"
        />
        <span>{shortcut ? `${shortcut} ${label}` : label}</span>
      </button>
      <Tooltip
        label={`${active ? 'Hide' : 'Show'} ${label}`}
        shortcut={shortcut}
        visible={showTooltip && !disabled}
      />
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
