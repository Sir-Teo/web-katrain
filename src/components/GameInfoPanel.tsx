import React from 'react';
import { shallow } from 'zustand/shallow';
import { FaCheck, FaEdit, FaExternalLinkAlt } from 'react-icons/fa';
import { useGameStore } from '../store/gameStore';
import { DEFAULT_BOARD_SIZE, type GameSettings } from '../types';
import { getMaxHandicap, normalizeBoardSize } from '../utils/boardSize';
import {
  formatGameInfoPlayer,
  formatGameInfoTitle,
  formatKomiLabel,
  getFirstGameInfoLink,
  formatRulesLabel,
  getVisibleGameInfoDetails,
  hasGameInfoMetadata,
  readRootInfoValue,
} from '../utils/gameInfoDisplay';

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
  { key: 'TM', label: 'Time', placeholder: 'Main time' },
];

const inputClass =
  'w-full ui-input border rounded px-2 py-1.5 text-xs text-[var(--ui-text)] focus:border-[var(--ui-accent)] outline-none';

export const GameInfoPanel: React.FC = () => {
  const { rootNode, komi, gameRules, setKomi, setHandicap, setRootProperty, updateSettings, treeVersion } = useGameStore(
    (state) => ({
      rootNode: state.rootNode,
      komi: state.komi,
      gameRules: state.settings.gameRules,
      setKomi: state.setKomi,
      setHandicap: state.setHandicap,
      setRootProperty: state.setRootProperty,
      updateSettings: state.updateSettings,
      treeVersion: state.treeVersion,
    }),
    shallow
  );
  void treeVersion;

  const rootProps = rootNode.properties ?? {};
  const valueFor = (key: string) => rootProps[key]?.[0] ?? '';
  const boardSize = normalizeBoardSize(rootNode.gameState.board.length, DEFAULT_BOARD_SIZE);
  const maxHandicap = getMaxHandicap(boardSize);
  const rawHandicap = Number.parseInt(rootProps.HA?.[0] ?? '0', 10);
  const handicap = Number.isFinite(rawHandicap) ? Math.max(0, Math.min(rawHandicap, maxHandicap)) : 0;
  const [komiInput, setKomiInput] = React.useState(() => String(komi));
  const [isEditingKomi, setIsEditingKomi] = React.useState(false);
  const [handicapInput, setHandicapInput] = React.useState(() => String(handicap));
  const [isEditingHandicap, setIsEditingHandicap] = React.useState(false);
  const [isEditingInfo, setIsEditingInfo] = React.useState(false);
  const title = formatGameInfoTitle(rootProps);
  const blackName = readRootInfoValue(rootProps, 'PB');
  const blackRank = readRootInfoValue(rootProps, 'BR');
  const whiteName = readRootInfoValue(rootProps, 'PW');
  const whiteRank = readRootInfoValue(rootProps, 'WR');
  const visibleDetails = getVisibleGameInfoDetails(rootProps);
  const sourceLink = getFirstGameInfoLink(rootProps);
  const hasMetadata = hasGameInfoMetadata(rootProps);
  const blackDisplay = formatGameInfoPlayer(blackName, blackRank, 'Black');
  const whiteDisplay = formatGameInfoPlayer(whiteName, whiteRank, 'White');

  React.useEffect(() => {
    if (!isEditingKomi) setKomiInput(String(komi));
  }, [isEditingKomi, komi]);

  React.useEffect(() => {
    if (!isEditingHandicap) setHandicapInput(String(handicap));
  }, [handicap, isEditingHandicap]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    e.stopPropagation();
  };

  const commitKomi = () => {
    const parsed = Number(komiInput.trim());
    if (Number.isFinite(parsed)) {
      setKomi(parsed);
      setKomiInput(String(Number(parsed.toFixed(2))));
    } else {
      setKomiInput(String(komi));
    }
    setIsEditingKomi(false);
  };

  const handleKomiKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    handleKeyDown(e);
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setKomiInput(String(komi));
      setIsEditingKomi(false);
      e.currentTarget.blur();
    }
  };

  const commitHandicap = () => {
    const parsed = Number.parseInt(handicapInput.trim(), 10);
    if (Number.isFinite(parsed)) {
      const next = Math.max(0, Math.min(parsed, maxHandicap));
      setHandicap(next);
      setHandicapInput(String(next));
    } else {
      setHandicapInput(String(handicap));
    }
    setIsEditingHandicap(false);
  };

  const handleHandicapKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    handleKeyDown(e);
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setHandicapInput(String(handicap));
      setIsEditingHandicap(false);
      e.currentTarget.blur();
    }
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

  // The Edit button above is the single affordance for opening the editor; this
  // card is plain content. It used to be a role="button" too, which both doubled
  // the control and made screen readers announce the whole block as one button.
  const renderDisplayMode = () => (
    <div
      className="w-full text-left space-y-3 rounded-md border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3"
      data-game-info-display="true"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-[var(--ui-text)]">{title}</div>
        {/* Only worth a line when it explains an empty-looking card — otherwise
            the players and details are right below. */}
        {hasMetadata ? null : <div className="mt-1 text-[11px] ui-text-faint">No metadata yet</div>}
      </div>

      <div className="grid grid-cols-1 gap-2">
        <div className="flex min-w-0 items-center gap-2 rounded border border-[var(--ui-border)] bg-[var(--ui-panel)] px-2 py-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-neutral-900 ring-1 ring-white/20" aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wide ui-text-faint">Black</div>
            <div className="truncate text-xs text-[var(--ui-text)]">{blackDisplay}</div>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2 rounded border border-[var(--ui-border)] bg-[var(--ui-panel)] px-2 py-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-white ring-1 ring-black/30" aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wide ui-text-faint">White</div>
            <div className="truncate text-xs text-[var(--ui-text)]">{whiteDisplay}</div>
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <dt className="text-[10px] font-semibold uppercase tracking-wide ui-text-faint">Komi</dt>
          <dd className="truncate text-xs text-[var(--ui-text)]">{formatKomiLabel(komi)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[10px] font-semibold uppercase tracking-wide ui-text-faint">Rules</dt>
          <dd className="truncate text-xs text-[var(--ui-text)]">{formatRulesLabel(gameRules)}</dd>
        </div>
        {handicap > 0 ? (
          <div className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-wide ui-text-faint">Handicap</dt>
            <dd className="truncate text-xs text-[var(--ui-text)]">{handicap}</dd>
          </div>
        ) : null}
      </dl>

      {visibleDetails.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {visibleDetails.map((detail) => (
            <span
              key={detail.key}
              className="min-w-0 max-w-full rounded border border-[var(--ui-border)] bg-[var(--ui-panel)] px-2 py-1 text-[11px] text-[var(--ui-text-muted)]"
            >
              <span className="font-semibold text-[var(--ui-text)]">{detail.label}:</span>{' '}
              <span className="break-words">{detail.value}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );

  const renderEditMode = () => (
    <div className="space-y-3" data-game-info-edit-form="true">
      <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2">
        {playerFields.map(renderField)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {detailFields.map(renderField)}
        <label className="min-w-0 space-y-1">
          <span className="block text-[10px] font-semibold uppercase tracking-wide ui-text-faint">
            Komi
          </span>
          <input
            value={komiInput}
            onChange={(e) => setKomiInput(e.target.value)}
            onFocus={() => setIsEditingKomi(true)}
            onBlur={commitKomi}
            onKeyDown={handleKomiKeyDown}
            placeholder="6.5"
            className={inputClass}
            inputMode="decimal"
            spellCheck={false}
          />
        </label>
        <label className="min-w-0 space-y-1">
          <span className="block text-[10px] font-semibold uppercase tracking-wide ui-text-faint">
            Handicap
          </span>
          <input
            value={handicapInput}
            onChange={(e) => setHandicapInput(e.target.value)}
            onFocus={() => setIsEditingHandicap(true)}
            onBlur={commitHandicap}
            onKeyDown={handleHandicapKeyDown}
            placeholder="0"
            className={inputClass}
            inputMode="numeric"
            min={0}
            max={maxHandicap}
            spellCheck={false}
          />
        </label>
        <label className="min-w-0 space-y-1">
          <span className="block text-[10px] font-semibold uppercase tracking-wide ui-text-faint">
            Rules
          </span>
          <select
            value={gameRules}
            onChange={(e) => updateSettings({ gameRules: e.target.value as GameSettings['gameRules'] })}
            onKeyDown={handleKeyDown}
            className={inputClass}
          >
            <option value="japanese">Japanese</option>
            <option value="chinese">Chinese</option>
            <option value="korean">Korean</option>
          </select>
        </label>
      </div>
    </div>
  );

  return (
    <div className="space-y-3" data-game-info-panel="true">
      <div className={['flex items-center justify-between gap-2', isEditingInfo ? 'game-info-edit-header' : ''].join(' ')}>
        {/* Display mode needs no heading: the enclosing section is already
            labelled and the game title is the next line. Edit mode keeps one
            because "Editing…" is state the reader has to see. */}
        {isEditingInfo ? (
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-[var(--ui-text)]">Editing game info</div>
            <div className="text-[10px] ui-text-faint">SGF root metadata</div>
          </div>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {!isEditingInfo && sourceLink ? (
            <a
              className="panel-action-button inline-flex items-center gap-1"
              href={sourceLink.href}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open link from ${sourceLink.sourceLabel}`}
              aria-label={`Open link from ${sourceLink.sourceLabel}`}
              data-game-info-source-link="true"
            >
              <FaExternalLinkAlt size={11} aria-hidden="true" />
              Source
            </a>
          ) : null}
          <button
            type="button"
            className="panel-action-button inline-flex items-center gap-1"
            onClick={() => setIsEditingInfo((current) => !current)}
            aria-pressed={isEditingInfo}
            data-game-info-edit-toggle="true"
          >
            {isEditingInfo ? <FaCheck size={11} aria-hidden="true" /> : <FaEdit size={11} aria-hidden="true" />}
            {isEditingInfo ? 'Done' : 'Edit'}
          </button>
        </div>
      </div>
      {isEditingInfo ? renderEditMode() : renderDisplayMode()}
    </div>
  );
};
