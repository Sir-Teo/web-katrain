import React from 'react';
import { FaSearch, FaTimes } from 'react-icons/fa';
import type { GameNode } from '../types';
import { useGameStore } from '../store/gameStore';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useInitialDialogFocus } from '../hooks/useInitialDialogFocus';
import { collectGameNotes, filterGameNotes, gameNoteSnippet } from '../utils/gameNotes';
import { isComposingKeyEvent } from '../utils/keyboardComposition';
import { MAX_SEARCH_QUERY_LENGTH } from '../utils/searchTerms';

type GameNotesSearchModalProps = {
  onClose: () => void;
  onSelectNode: (node: GameNode) => void;
  returnFocus?: HTMLElement | null;
};

const PAGE_SIZE = 50;

export const GameNotesSearchModal: React.FC<GameNotesSearchModalProps> = ({ onClose, onSelectNode, returnFocus }) => {
  useEscapeToClose(onClose);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const activeRef = React.useRef<HTMLButtonElement>(null);
  const dialogRef = useInitialDialogFocus<HTMLDivElement>(true, { initialFocusRef: inputRef, returnFocus });
  const rootNode = useGameStore(state => state.rootNode);
  const currentNodeId = useGameStore(state => state.currentNode.id);
  const isInsertMode = useGameStore(state => state.isInsertMode);
  // Snapshot on open or game replacement. Analysis updates don't change saved
  // annotations, and must not repeatedly scan the tree or reset a selection.
  const entries = React.useMemo(() => collectGameNotes(rootNode), [rootNode]);
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);
  const results = React.useMemo(() => filterGameNotes(entries, query), [entries, query]);
  const listId = React.useId();
  const shown = results.slice(0, visibleCount);
  const active = shown[activeIndex];

  React.useEffect(() => {
    setActiveIndex(0);
    setVisibleCount(PAGE_SIZE);
  }, [results]);
  React.useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, results]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-3 pt-[6dvh] sm:p-6 sm:pt-[10dvh] mobile-safe-inset mobile-safe-area-bottom">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-notes-search-title"
        className="ui-panel flex max-h-[86dvh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border shadow-xl"
        onKeyDown={event => {
          if (isComposingKeyEvent(event.nativeEvent) || event.target !== inputRef.current) return;
          if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && shown.length) {
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            setActiveIndex(index => (index + direction + shown.length) % shown.length);
          } else if (event.key === 'Enter' && active && !isInsertMode) {
            event.preventDefault();
            onSelectNode(active.node);
          }
        }}
      >
        <div className="ui-bar flex shrink-0 items-center justify-between gap-3 border-b border-[var(--ui-border)] p-4">
          <div className="min-w-0">
            <h2 id="game-notes-search-title" className="text-lg font-semibold text-[var(--ui-text)]">Find notes</h2>
            <p className="mt-1 text-xs ui-text-muted">Search saved notes and named positions in every variation.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close find notes" className="ui-control grid shrink-0 place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)]">
            <FaTimes aria-hidden="true" />
          </button>
        </div>
        <div className="shrink-0 p-3">
          <div className="relative">
            <FaSearch aria-hidden="true" size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ui-text-faint)]" />
            <input
              ref={inputRef}
              type="text"
              inputMode="search"
              enterKeyHint="go"
              role="combobox"
              aria-label="Search game notes"
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={active ? `${listId}-${active.node.id}` : undefined}
              value={query}
              onChange={event => setQuery(event.currentTarget.value)}
              placeholder="Search notes, move names, or coordinates"
              maxLength={MAX_SEARCH_QUERY_LENGTH}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              className="ui-input h-11 w-full rounded-lg border py-2 pl-8 pr-12 text-sm text-[var(--ui-text)]"
            />
            {query && (
              <button type="button" aria-label="Clear note search" onClick={() => { setQuery(''); inputRef.current?.focus(); }} className="absolute right-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)]">
                <FaTimes aria-hidden="true" size={11} />
              </button>
            )}
          </div>
          <div className="mt-2 text-xs ui-text-faint" role="status" aria-live="polite">
            {results.length} {results.length === 1 ? 'position' : 'positions'}{query.trim() ? ' found' : ' with notes'}
          </div>
          {isInsertMode && <p className="mt-2 text-xs text-[var(--ui-warning)]">Finish inserting before navigating to a note.</p>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
          <div id={listId} role="listbox" aria-label="Noted positions" className="space-y-1">
            {shown.map((entry, index) => (
              <button
                key={entry.node.id}
                id={`${listId}-${entry.node.id}`}
                ref={index === activeIndex ? activeRef : undefined}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={index === activeIndex}
                aria-current={entry.node.id === currentNodeId ? 'true' : undefined}
                disabled={isInsertMode}
                onClick={() => onSelectNode(entry.node)}
                onPointerMove={event => { if (event.pointerType !== 'touch') setActiveIndex(index); }}
                data-game-note-result={entry.node.id}
                className={[
                  'block min-h-11 w-full rounded-lg border p-3 text-left disabled:cursor-not-allowed disabled:opacity-50',
                  index === activeIndex ? 'border-[var(--ui-accent)] bg-[var(--ui-accent-soft)]' : 'border-transparent hover:bg-[var(--ui-surface-2)]',
                ].join(' ')}
              >
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--ui-text-muted)]">
                  <span className="font-mono">{entry.label}</span>
                  {entry.isVariation && <span>Variation</span>}
                  {entry.node.id === currentNodeId && <span className="font-semibold text-[var(--ui-accent)]">Current position</span>}
                </span>
                {entry.title && <span className="mt-1 block break-words text-sm font-semibold text-[var(--ui-text)]">{entry.title}</span>}
                {entry.note && <span className="mt-1 block break-words text-sm leading-relaxed text-[var(--ui-text)]">{gameNoteSnippet(entry.note, query)}</span>}
              </button>
            ))}
          </div>
          {results.length === 0 && (
            <p className="rounded-lg border border-[var(--ui-border)] p-4 text-sm ui-text-muted">
              {entries.length ? `No notes match “${query.trim()}”. Try another word or coordinate.` : 'No notes yet. Add a note to a position to find it here.'}
            </p>
          )}
          {shown.length < results.length && <button type="button" onClick={() => { setVisibleCount(shown.length + PAGE_SIZE); setActiveIndex(shown.length); inputRef.current?.focus(); }} className="ui-control mt-2 min-h-11 w-full rounded-lg border px-3 text-sm">Show more positions</button>}
        </div>
      </div>
    </div>
  );
};
