import React, { useMemo, useState } from 'react';
import { FaTimes, FaSearch, FaDownload, FaDice } from 'react-icons/fa';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { StaticBoard } from './StaticBoard';
import { PRO_GAMES, buildFinalBoard, filterProGames, type ProGameMeta } from '../utils/proGames';
import { tagsFromResult, narrativeTagToneClass } from '../utils/narrativeTags';

interface ProGamesModalProps {
  onClose: () => void;
  onLoadGame: (sgf: string, name: string) => void | Promise<void>;
}

const playerLine = (name: string, rank?: string) => (rank ? `${name} (${rank})` : name);

// A small curated strip so first-time visitors have a starting point.
const FEATURED_PRO_GAMES = PRO_GAMES.slice(0, Math.min(4, PRO_GAMES.length));

export const ProGamesModal: React.FC<ProGamesModalProps> = ({ onClose, onLoadGame }) => {
  useEscapeToClose(onClose);

  const [query, setQuery] = useState('');
  const filtered = useMemo(() => filterProGames(PRO_GAMES, query), [query]);
  const [selectedId, setSelectedId] = useState<string>(PRO_GAMES[0]?.id ?? '');

  const surpriseMe = () => {
    if (PRO_GAMES.length === 0) return;
    const pick = PRO_GAMES[Math.floor(Math.random() * PRO_GAMES.length)]!;
    setQuery('');
    setSelectedId(pick.id);
  };

  const selected: ProGameMeta | undefined = useMemo(
    () => filtered.find((g) => g.id === selectedId) ?? filtered[0],
    [filtered, selectedId],
  );

  const preview = useMemo(() => {
    if (!selected) return null;
    try {
      return buildFinalBoard(selected.sgf);
    } catch {
      return null;
    }
  }, [selected]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-3 mobile-safe-inset mobile-safe-area-bottom"
      onClick={onClose}
    >
      <div
        className="ui-panel flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pro-games-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ui-bar flex items-center justify-between border-b border-[var(--ui-border)] px-4 py-3">
          <h2 id="pro-games-title" className="text-lg font-semibold text-[var(--ui-text)]">
            Pro Game Library
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="ui-control grid place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
            aria-label="Close pro game library"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* List */}
          <div className="flex min-h-0 flex-1 flex-col border-b border-[var(--ui-border)] md:max-w-[55%] md:border-b-0 md:border-r">
            <div className="space-y-2 border-b border-[var(--ui-border)] p-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <FaSearch aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ui-text-muted)]" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by player, event, date…"
                    className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] py-2 pl-9 pr-3 text-sm text-[var(--ui-text)]"
                    autoFocus
                  />
                </div>
                <button
                  type="button"
                  onClick={surpriseMe}
                  className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]"
                  title="Jump to a random pro game"
                >
                  <FaDice aria-hidden="true" /> <span className="hidden sm:inline">Surprise me</span>
                </button>
              </div>
              {FEATURED_PRO_GAMES.length > 0 && !query && (
                <div className="flex flex-wrap items-center gap-1.5" aria-label="Featured games">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ui-text-faint)]">Featured</span>
                  {FEATURED_PRO_GAMES.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setSelectedId(g.id)}
                      className={[
                        'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                        selected?.id === g.id
                          ? 'border-[var(--ui-accent)] bg-[var(--ui-accent-soft,var(--ui-surface-2))] text-[var(--ui-text)]'
                          : 'border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]',
                      ].join(' ')}
                      title={`${playerLine(g.black, g.blackRank)} vs ${playerLine(g.white, g.whiteRank)}`}
                    >
                      {g.black.split(' ').slice(-1)[0]} v {g.white.split(' ').slice(-1)[0]}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {filtered.length === 0 && (
                <li className="p-4 text-sm text-[var(--ui-text-muted)]">No games match “{query}”.</li>
              )}
              {filtered.map((g) => {
                const active = selected?.id === g.id;
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(g.id)}
                      className={`w-full border-b border-[var(--ui-border)] px-4 py-3 text-left text-sm hover:bg-[var(--ui-surface-2)] ${
                        active ? 'bg-[var(--ui-accent-soft,var(--ui-surface-2))]' : ''
                      }`}
                    >
                      <div className="font-semibold text-[var(--ui-text)]">
                        {playerLine(g.black, g.blackRank)} vs {playerLine(g.white, g.whiteRank)}
                      </div>
                      <div className="text-xs text-[var(--ui-text-muted)]">
                        {[g.event, g.date, g.result].filter(Boolean).join(' · ')}
                      </div>
                      {(() => {
                        const tags = tagsFromResult(g.result);
                        if (tags.length === 0) return null;
                        return (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {tags.map((tag) => (
                              <span
                                key={tag.id}
                                className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${narrativeTagToneClass(tag.tone)}`}
                                title={tag.title}
                              >
                                {tag.label}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Detail / preview */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
            {selected ? (
              <>
                <div className="mx-auto w-full max-w-[280px]">
                  {preview ? (
                    <StaticBoard board={preview.board} ariaLabel="Final position preview" maxPx={280} />
                  ) : (
                    <div className="aspect-square w-full rounded bg-[var(--ui-surface-2)]" />
                  )}
                </div>
                <div className="mt-3 space-y-1 text-sm">
                  <div className="font-semibold text-[var(--ui-text)]">
                    {playerLine(selected.black, selected.blackRank)} vs {playerLine(selected.white, selected.whiteRank)}
                  </div>
                  {selected.event && <div className="text-[var(--ui-text-muted)]">{selected.event}</div>}
                  <div className="flex flex-wrap gap-x-4 text-xs text-[var(--ui-text-muted)]">
                    {selected.date && <span>{selected.date}</span>}
                    {selected.result && <span>Result: {selected.result}</span>}
                    <span>{selected.boardSize}×{selected.boardSize}</span>
                    {preview && <span>{preview.moveCount} moves</span>}
                    <span>{selected.source}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void onLoadGame(selected.sgf, selected.name)}
                  className="mt-4 min-h-11 rounded-lg border border-[var(--ui-accent)] bg-[var(--ui-accent-soft,var(--ui-surface-2))] px-4 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]"
                >
                  <span className="inline-flex items-center gap-2"><FaDownload aria-hidden="true" /> Load &amp; study this game</span>
                </button>
              </>
            ) : (
              <div className="grid flex-1 place-items-center text-sm text-[var(--ui-text-muted)]">Select a game</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

ProGamesModal.displayName = 'ProGamesModal';
