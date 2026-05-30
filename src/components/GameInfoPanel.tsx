import React from 'react';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';

type GameInfoField = {
  key: string;
  label: string;
  placeholder: string;
  className?: string;
};

const playerFields: GameInfoField[] = [
  { key: 'PB', label: 'Black', placeholder: 'Black player' },
  { key: 'BR', label: 'Rank', placeholder: 'Rank' },
  { key: 'PW', label: 'White', placeholder: 'White player' },
  { key: 'WR', label: 'Rank', placeholder: 'Rank' },
];

const detailFields: GameInfoField[] = [
  { key: 'GN', label: 'Game', placeholder: 'Game name', className: 'sm:col-span-2' },
  { key: 'EV', label: 'Event', placeholder: 'Event', className: 'sm:col-span-2' },
  { key: 'DT', label: 'Date', placeholder: 'YYYY-MM-DD' },
  { key: 'PC', label: 'Place', placeholder: 'Location' },
  { key: 'RE', label: 'Result', placeholder: 'B+R, W+2.5' },
];

const inputClass =
  'w-full ui-input border rounded px-2 py-1.5 text-xs text-[var(--ui-text)] focus:border-[var(--ui-accent)] outline-none';

export const GameInfoPanel: React.FC = () => {
  const { rootNode, setRootProperty, treeVersion } = useGameStore(
    (state) => ({
      rootNode: state.rootNode,
      setRootProperty: state.setRootProperty,
      treeVersion: state.treeVersion,
    }),
    shallow
  );
  void treeVersion;

  const rootProps = rootNode.properties ?? {};
  const valueFor = (key: string) => rootProps[key]?.[0] ?? '';
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
  };

  const renderField = ({ key, label, placeholder, className }: GameInfoField) => (
    <label key={key} className={['min-w-0 space-y-1', className ?? ''].join(' ')}>
      <span className="block text-[10px] font-semibold uppercase tracking-wide ui-text-faint">
        {label}
      </span>
      <input
        value={valueFor(key)}
        onChange={(e) => setRootProperty(key, e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={inputClass}
        spellCheck={false}
      />
    </label>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2">
        {playerFields.map(renderField)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {detailFields.map(renderField)}
      </div>
    </div>
  );
};
