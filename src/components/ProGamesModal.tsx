import React, { useMemo, useState } from 'react';
import { FaTimes, FaSearch, FaDownload, FaUser, FaArrowLeft, FaSitemap } from 'react-icons/fa';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useInitialDialogFocus } from '../hooks/useInitialDialogFocus';
import { StaticBoard } from './StaticBoard';
import {
  PRO_GAMES,
  buildFinalBoard,
  filterProGames,
  buildPlayerProfiles,
  indexOpenings,
  getOpeningContinuations,
  buildBoardFromMoves,
  type ProGameMeta,
  type PlayerProfile,
  type OpeningMove,
} from '../utils/proGames';

interface ProGamesModalProps {
  onClose: () => void;
  onLoadGame: (sgf: string, name: string) => void | Promise<void>;
}

type Tab = 'games' | 'players' | 'openings';

const playerLine = (name: string, rank?: string) => (rank ? `${name} (${rank})` : name);

const coordLabel = (x: number, y: number, size = 19): string => {
  const letters = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';
  return `${letters[x] ?? '?'}${size - y}`;
};

const TabButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({
  active,
  onClick,
  icon,
  label,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex min-h-10 items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
      active
        ? 'border-[var(--ui-accent)] text-[var(--ui-text)]'
        : 'border-transparent text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]'
    }`}
    aria-pressed={active}
  >
    {icon}
    {label}
  </button>
);

const GameRow: React.FC<{ game: ProGameMeta; active?: boolean; onClick: () => void }> = ({ game, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full border-b border-[var(--ui-border)] px-4 py-3 text-left text-sm hover:bg-[var(--ui-surface-2)] ${
      active ? 'bg-[var(--ui-accent-soft,var(--ui-surface-2))]' : ''
    }`}
  >
    <div className="font-semibold text-[var(--ui-text)]">
      {playerLine(game.black, game.blackRank)} vs {playerLine(game.white, game.whiteRank)}
    </div>
    <div className="text-xs text-[var(--ui-text-muted)]">
      {[game.event, game.date, game.result].filter(Boolean).join(' · ')}
    </div>
  </button>
);

const GameDetail: React.FC<{
  game: ProGameMeta;
  onLoad: () => void;
}> = ({ game, onLoad }) => {
  const preview = useMemo(() => {
    try {
      return buildFinalBoard(game.sgf);
    } catch {
      return null;
    }
  }, [game.sgf]);
  return (
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
          {playerLine(game.black, game.blackRank)} vs {playerLine(game.white, game.whiteRank)}
        </div>
        {game.event && <div className="text-[var(--ui-text-muted)]">{game.event}</div>}
        <div className="flex flex-wrap gap-x-4 text-xs text-[var(--ui-text-muted)]">
          {game.date && <span>{game.date}</span>}
          {game.result && <span>Result: {game.result}</span>}
          <span>
            {game.boardSize}×{game.boardSize}
          </span>
          {preview && <span>{preview.moveCount} moves</span>}
          <span>{game.source}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onLoad}
        className="mt-4 min-h-11 rounded-lg border border-[var(--ui-accent)] bg-[var(--ui-accent-soft,var(--ui-surface-2))] px-4 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]"
      >
        <span className="inline-flex items-center gap-2">
          <FaDownload aria-hidden="true" /> Load &amp; study this game
        </span>
      </button>
    </>
  );
};

/* ------------------------------- Games tab ------------------------------- */
const GamesTab: React.FC<{ onLoadGame: (sgf: string, name: string) => void | Promise<void> }> = ({ onLoadGame }) => {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => filterProGames(PRO_GAMES, query), [query]);
  const [selectedId, setSelectedId] = useState<string>(PRO_GAMES[0]?.id ?? '');
  // On mobile the panes can't share the screen, so we switch to a master/detail
  // flow: the list fills the screen until a game is tapped (`entered`), then the
  // detail view takes over with a Back control. On md+ both panes show at once.
  const [entered, setEntered] = useState(false);
  const selected = useMemo(
    () => filtered.find((g) => g.id === selectedId) ?? filtered[0],
    [filtered, selectedId],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div
        className={`${entered ? 'hidden' : 'flex'} min-h-0 flex-1 flex-col border-[var(--ui-border)] md:flex md:max-w-[55%] md:border-r`}
      >
        <div className="border-b border-[var(--ui-border)] p-3">
          <div className="relative">
            <FaSearch
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ui-text-muted)]"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by player, event, date…"
              className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] py-2 pl-9 pr-3 text-sm text-[var(--ui-text)]"
            />
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <li className="p-4 text-sm text-[var(--ui-text-muted)]">No games match “{query}”.</li>
          )}
          {filtered.map((g) => (
            <li key={g.id}>
              <GameRow
                game={g}
                active={selected?.id === g.id}
                onClick={() => {
                  setSelectedId(g.id);
                  setEntered(true);
                }}
              />
            </li>
          ))}
        </ul>
      </div>
      <div className={`${entered ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col overflow-y-auto p-4 md:flex`}>
        {selected ? (
          <>
            <button
              type="button"
              onClick={() => setEntered(false)}
              className="mb-3 inline-flex items-center gap-2 self-start text-sm text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] md:hidden"
            >
              <FaArrowLeft aria-hidden="true" /> Back to games
            </button>
            <GameDetail game={selected} onLoad={() => void onLoadGame(selected.sgf, selected.name)} />
          </>
        ) : (
          <div className="grid flex-1 place-items-center text-sm text-[var(--ui-text-muted)]">Select a game</div>
        )}
      </div>
    </div>
  );
};

/* ------------------------------ Players tab ------------------------------ */
const PlayersTab: React.FC<{ onLoadGame: (sgf: string, name: string) => void | Promise<void> }> = ({ onLoadGame }) => {
  const profiles = useMemo(() => buildPlayerProfiles(PRO_GAMES), []);
  const [query, setQuery] = useState('');
  const [openName, setOpenName] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? profiles.filter((p) => p.name.toLowerCase().includes(q)) : profiles;
  }, [profiles, query]);
  const open = useMemo<PlayerProfile | undefined>(
    () => profiles.find((p) => p.name === openName),
    [profiles, openName],
  );

  if (open) {
    const winPct = open.decided > 0 ? Math.round((open.wins / open.decided) * 100) : null;
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
        <button
          type="button"
          onClick={() => setOpenName(null)}
          className="mb-3 inline-flex items-center gap-2 self-start text-sm text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
        >
          <FaArrowLeft aria-hidden="true" /> All players
        </button>
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-full bg-[var(--ui-surface-2)] text-[var(--ui-text-muted)]">
            <FaUser aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[var(--ui-text)]">{open.name}</h3>
            {open.ranks.length > 0 && (
              <div className="text-xs text-[var(--ui-text-muted)]">{open.ranks.join(' · ')}</div>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-[var(--ui-surface-2)] p-2">
            <div className="text-lg font-semibold text-[var(--ui-text)]">{open.games.length}</div>
            <div className="text-xs text-[var(--ui-text-muted)]">Games</div>
          </div>
          <div className="rounded-lg bg-[var(--ui-surface-2)] p-2">
            <div className="text-lg font-semibold text-[var(--ui-text)]">
              {open.wins}–{open.losses}
            </div>
            <div className="text-xs text-[var(--ui-text-muted)]">Record</div>
          </div>
          <div className="rounded-lg bg-[var(--ui-surface-2)] p-2">
            <div className="text-lg font-semibold text-[var(--ui-text)]">{winPct === null ? '—' : `${winPct}%`}</div>
            <div className="text-xs text-[var(--ui-text-muted)]">Win rate</div>
          </div>
        </div>
        <div className="mt-2 text-xs text-[var(--ui-text-muted)]">
          {open.asBlack} as Black · {open.asWhite} as White
        </div>

        {open.opponents.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">
              Frequent opponents
            </div>
            <div className="flex flex-wrap gap-1.5">
              {open.opponents.slice(0, 8).map((o) => (
                <button
                  key={o.name}
                  type="button"
                  onClick={() => setOpenName(o.name)}
                  className="rounded-full border border-[var(--ui-border)] px-2.5 py-1 text-xs text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]"
                >
                  {o.name} · {o.count}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 min-h-0 flex-1">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">
            Games ({open.games.length})
          </div>
          <ul className="overflow-hidden rounded-lg border border-[var(--ui-border)]">
            {open.games.map((g) => (
              <li key={g.id}>
                <GameRow game={g} onClick={() => void onLoadGame(g.sgf, g.name)} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-[var(--ui-border)] p-3">
        <div className="relative">
          <FaSearch
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ui-text-muted)]"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players…"
            className="w-full rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] py-2 pl-9 pr-3 text-sm text-[var(--ui-text)]"
          />
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <li className="p-4 text-sm text-[var(--ui-text-muted)]">No players match “{query}”.</li>
        )}
        {filtered.map((p) => {
          const winPct = p.decided > 0 ? Math.round((p.wins / p.decided) * 100) : null;
          return (
            <li key={p.name}>
              <button
                type="button"
                onClick={() => setOpenName(p.name)}
                className="flex w-full items-center justify-between border-b border-[var(--ui-border)] px-4 py-3 text-left hover:bg-[var(--ui-surface-2)]"
              >
                <div>
                  <div className="text-sm font-semibold text-[var(--ui-text)]">{p.name}</div>
                  <div className="text-xs text-[var(--ui-text-muted)]">
                    {p.games.length} games{p.ranks.length > 0 ? ` · ${p.ranks[p.ranks.length - 1]}` : ''}
                  </div>
                </div>
                <div className="text-right text-xs text-[var(--ui-text-muted)]">
                  <div className="text-[var(--ui-text)]">
                    {p.wins}–{p.losses}
                  </div>
                  {winPct !== null && <div>{winPct}%</div>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/* ----------------------------- Openings tab ------------------------------ */
const OpeningsTab: React.FC<{ onLoadGame: (sgf: string, name: string) => void | Promise<void> }> = ({ onLoadGame }) => {
  const indexed = useMemo(() => indexOpenings(PRO_GAMES), []);
  const [path, setPath] = useState<OpeningMove[]>([]);
  const continuations = useMemo(() => getOpeningContinuations(indexed, path), [indexed, path]);
  const board = useMemo(() => buildBoardFromMoves(path), [path]);
  const matchingGames = useMemo(() => {
    if (path.length === 0) return [];
    // Games whose opening matches the full current path.
    return indexed
      .filter(({ opening }) => {
        if (opening.length < path.length) return false;
        return path.every((m, i) => opening[i]!.x === m.x && opening[i]!.y === m.y);
      })
      .map(({ game }) => game);
  }, [indexed, path]);
  const lastMove = path.length > 0 ? { x: path[path.length - 1]!.x, y: path[path.length - 1]!.y } : undefined;

  return (
    // Mobile: one scrolling column (board on top, continuations below). The
    // board takes its natural height (shrink-0) so it never overlaps the list.
    // md+: two independent, side-by-side scroll panes.
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
      <div className="flex shrink-0 flex-col items-center border-b border-[var(--ui-border)] p-4 md:min-h-0 md:max-w-[50%] md:flex-1 md:overflow-y-auto md:border-b-0 md:border-r">
        <div className="mb-3 flex w-full items-center gap-2">
          <button
            type="button"
            disabled={path.length === 0}
            onClick={() => setPath((p) => p.slice(0, -1))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ui-border)] px-2.5 py-1 text-xs text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)] disabled:opacity-40"
          >
            <FaArrowLeft aria-hidden="true" /> Back
          </button>
          <button
            type="button"
            disabled={path.length === 0}
            onClick={() => setPath([])}
            className="rounded-lg border border-[var(--ui-border)] px-2.5 py-1 text-xs text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)] disabled:opacity-40"
          >
            Reset
          </button>
          <span className="ml-auto text-xs text-[var(--ui-text-muted)]">Move {path.length}</span>
        </div>
        <div className="w-full max-w-[320px]">
          <StaticBoard board={board} lastMove={lastMove} ariaLabel="Opening position" maxPx={320} />
        </div>
        <div className="mt-2 text-xs text-[var(--ui-text-muted)]">
          {path.length === 0
            ? `${indexed.length} games · pick a first move`
            : path.map((m) => coordLabel(m.x, m.y)).join(' ')}
        </div>
      </div>

      <div className="flex flex-col p-4 md:min-h-0 md:flex-1 md:overflow-y-auto">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">
          Continuations
        </div>
        {continuations.length === 0 ? (
          <div className="text-sm text-[var(--ui-text-muted)]">
            No further games follow this sequence. Load one of the {matchingGames.length} matching games below.
          </div>
        ) : (
          <ul className="space-y-1">
            {continuations.map((c) => {
              const total = continuations.reduce((s, x) => s + x.count, 0);
              const pct = Math.round((c.count / total) * 100);
              return (
                <li key={`${c.x},${c.y}`}>
                  <button
                    type="button"
                    onClick={() => setPath((p) => [...p, { x: c.x, y: c.y, player: c.player }])}
                    className="flex w-full items-center gap-3 rounded-lg border border-[var(--ui-border)] px-3 py-2 text-left text-sm hover:bg-[var(--ui-surface-2)]"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded bg-[var(--ui-surface-2)] text-xs font-semibold text-[var(--ui-text)]">
                      {c.player === 'black' ? '●' : '○'}
                    </span>
                    <span className="font-mono text-[var(--ui-text)]">{coordLabel(c.x, c.y)}</span>
                    <span className="ml-auto text-xs text-[var(--ui-text-muted)]">
                      {c.count} {c.count === 1 ? 'game' : 'games'} · {pct}%
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {matchingGames.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]">
              Games with this opening ({matchingGames.length})
            </div>
            <ul className="overflow-hidden rounded-lg border border-[var(--ui-border)]">
              {matchingGames.slice(0, 12).map((g) => (
                <li key={g.id}>
                  <GameRow game={g} onClick={() => void onLoadGame(g.sgf, g.name)} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export const ProGamesModal: React.FC<ProGamesModalProps> = ({ onClose, onLoadGame }) => {
  useEscapeToClose(onClose);
  const dialogRef = useInitialDialogFocus<HTMLDivElement>();
  const [tab, setTab] = useState<Tab>('games');

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-3 mobile-safe-inset mobile-safe-area-bottom"
      onClick={onClose}
    >
      <div
        className="ui-panel flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border shadow-xl"
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pro-games-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ui-bar flex items-center justify-between border-b border-[var(--ui-border)] px-4 py-3">
          <h2 id="pro-games-title" className="text-lg font-semibold text-[var(--ui-text)]">
            Pro Game Database
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="ui-control grid place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
            aria-label="Close pro game database"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <div className="ui-bar flex border-b border-[var(--ui-border)] px-2">
          <TabButton active={tab === 'games'} onClick={() => setTab('games')} icon={<FaSearch aria-hidden="true" />} label="Games" />
          <TabButton active={tab === 'players'} onClick={() => setTab('players')} icon={<FaUser aria-hidden="true" />} label="Players" />
          <TabButton active={tab === 'openings'} onClick={() => setTab('openings')} icon={<FaSitemap aria-hidden="true" />} label="Openings" />
        </div>

        {tab === 'games' && <GamesTab onLoadGame={onLoadGame} />}
        {tab === 'players' && <PlayersTab onLoadGame={onLoadGame} />}
        {tab === 'openings' && <OpeningsTab onLoadGame={onLoadGame} />}
      </div>
    </div>
  );
};

ProGamesModal.displayName = 'ProGamesModal';
