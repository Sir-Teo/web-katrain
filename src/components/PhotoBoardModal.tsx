import React from 'react';
import { FaCamera, FaEraser, FaFolderOpen, FaTimes, FaTrash } from 'react-icons/fa';
import type { BoardSize, Player } from '../types';
import { BOARD_SIZES } from '../utils/boardSize';
import { buildPhotoBoardSetupSgf, type PhotoBoardStone } from '../utils/photoBoard';

interface PhotoBoardModalProps {
  onClose: () => void;
  onImportSgf: (sgf: string) => void;
  defaultBoardSize: BoardSize;
  defaultKomi: number;
  initialPhotoFile?: File | null;
}

type TraceTool = Player | 'erase';

const makeEmptyStones = (boardSize: BoardSize): PhotoBoardStone[] =>
  Array.from({ length: boardSize * boardSize }, () => null);

const stoneLabel = (stone: PhotoBoardStone): string => {
  if (stone === 'black') return 'black';
  if (stone === 'white') return 'white';
  return 'empty';
};

const gtpPoint = (index: number, boardSize: BoardSize): string => {
  const x = index % boardSize;
  const y = Math.floor(index / boardSize);
  const col = String.fromCharCode(65 + (x >= 8 ? x + 1 : x));
  return `${col}${boardSize - y}`;
};

export const PhotoBoardModal: React.FC<PhotoBoardModalProps> = ({
  onClose,
  onImportSgf,
  defaultBoardSize,
  defaultKomi,
  initialPhotoFile = null,
}) => {
  const galleryInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const photoUrlRef = React.useRef<string | null>(null);
  const [boardSize, setBoardSize] = React.useState<BoardSize>(defaultBoardSize);
  const [komi, setKomi] = React.useState(defaultKomi);
  const [nextPlayer, setNextPlayer] = React.useState<Player>('black');
  const [tool, setTool] = React.useState<TraceTool>('black');
  const [stones, setStones] = React.useState<PhotoBoardStone[]>(() => makeEmptyStones(defaultBoardSize));
  const [photoUrl, setPhotoUrl] = React.useState<string | null>(null);
  const [photoName, setPhotoName] = React.useState<string>('');

  React.useEffect(() => {
    return () => {
      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    };
  }, []);

  const counts = React.useMemo(() => {
    let black = 0;
    let white = 0;
    for (const stone of stones) {
      if (stone === 'black') black += 1;
      else if (stone === 'white') white += 1;
    }
    return { black, white, total: black + white };
  }, [stones]);

  const choosePhoto = React.useCallback((file: File | undefined) => {
    if (!file) return;
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    const objectUrl = URL.createObjectURL(file);
    photoUrlRef.current = objectUrl;
    setPhotoName(file.name || 'Camera photo');
    setPhotoUrl(objectUrl);
  }, []);

  React.useEffect(() => {
    choosePhoto(initialPhotoFile ?? undefined);
  }, [choosePhoto, initialPhotoFile]);

  const updateBoardSize = (next: BoardSize) => {
    setBoardSize(next);
    setStones(makeEmptyStones(next));
  };

  const toggleStone = (index: number) => {
    setStones((prev) => {
      const next = [...prev];
      const current = next[index] ?? null;
      const value: PhotoBoardStone = tool === 'erase' ? null : tool;
      next[index] = current === value ? null : value;
      return next;
    });
  };

  const clearBoard = () => setStones(makeEmptyStones(boardSize));

  const importBoard = () => {
    const sgf = buildPhotoBoardSetupSgf({
      boardSize,
      stones,
      komi,
      nextPlayer,
      sourceName: photoName,
    });
    onImportSgf(sgf);
  };

  const toolButtonClass = (active: boolean) => [
    'min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors',
    active
      ? 'border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] text-[var(--ui-accent)]'
      : 'border-[var(--ui-border)] bg-[var(--ui-surface)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]',
  ].join(' ');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-2 sm:p-4">
      <div className="ui-panel flex h-full max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border shadow-xl">
        <div className="ui-bar flex items-center justify-between border-b border-[var(--ui-border)] px-4 py-3">
          <h2 className="text-lg font-semibold text-[var(--ui-text)]">Photo Board</h2>
          <button
            type="button"
            onClick={onClose}
            className="ui-control grid place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
            aria-label="Close photo board"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(260px,0.75fr)_minmax(360px,1fr)]">
          <section className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="min-h-11 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]"
                onClick={() => cameraInputRef.current?.click()}
              >
                <span className="flex items-center justify-center gap-2"><FaCamera /> Camera</span>
              </button>
              <button
                type="button"
                className="min-h-11 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]"
                onClick={() => galleryInputRef.current?.click()}
              >
                <span className="flex items-center justify-center gap-2"><FaFolderOpen /> Photo</span>
              </button>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => choosePhoto(event.target.files?.[0])}
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => choosePhoto(event.target.files?.[0])}
              />
            </div>

            <div className="overflow-hidden rounded-lg border border-[var(--ui-border)] bg-black/20">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt={photoName || 'Board photo'}
                  className="h-auto max-h-[42vh] w-full object-contain"
                />
              ) : (
                <div className="grid aspect-[4/3] place-items-center bg-[var(--ui-surface)] text-sm ui-text-muted">
                  <FaCamera size={28} aria-hidden="true" />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-sm">
                <span className="ui-text-muted">Board</span>
                <select
                  value={boardSize}
                  onChange={(event) => updateBoardSize(Number(event.target.value) as BoardSize)}
                  className="min-h-11 w-full rounded-lg border ui-input px-3 py-2 text-[var(--ui-text)]"
                >
                  {BOARD_SIZES.map((size) => (
                    <option key={size} value={size}>{size}x{size}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="ui-text-muted">Komi</span>
                <input
                  type="number"
                  step="0.5"
                  value={komi}
                  onChange={(event) => setKomi(Number(event.target.value))}
                  className="min-h-11 w-full rounded-lg border ui-input px-3 py-2 text-[var(--ui-text)]"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Next player">
              {(['black', 'white'] as Player[]).map((player) => (
                <button
                  key={player}
                  type="button"
                  className={toolButtonClass(nextPlayer === player)}
                  onClick={() => setNextPlayer(player)}
                >
                  {player === 'black' ? 'Black next' : 'White next'}
                </button>
              ))}
            </div>
          </section>

          <section className="min-w-0 space-y-3">
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Trace tool">
              <button
                type="button"
                className={toolButtonClass(tool === 'black')}
                onClick={() => setTool('black')}
              >
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full bg-black ring-1 ring-white/30" aria-hidden="true" /> Black
                </span>
              </button>
              <button
                type="button"
                className={toolButtonClass(tool === 'white')}
                onClick={() => setTool('white')}
              >
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full bg-white ring-1 ring-black/25" aria-hidden="true" /> White
                </span>
              </button>
              <button
                type="button"
                className={toolButtonClass(tool === 'erase')}
                onClick={() => setTool('erase')}
              >
                <span className="inline-flex items-center gap-2"><FaEraser /> Erase</span>
              </button>
            </div>

            <div className="mx-auto w-full max-w-[min(78vh,640px)] rounded-lg border border-[var(--ui-border)] bg-[#c89a55] p-2 shadow-inner">
              <div
                className="grid overflow-hidden rounded border border-black/35"
                style={{ gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))` }}
                aria-label={`${boardSize} by ${boardSize} trace board`}
              >
                {stones.map((stone, index) => (
                  <button
                    key={`${boardSize}-${index}`}
                    type="button"
                    className="relative aspect-square border border-black/25 bg-[#d7ad68] hover:bg-[#e5bd78] focus:z-10 focus:outline-none focus:ring-2 focus:ring-[var(--ui-accent)]"
                    onClick={() => toggleStone(index)}
                    aria-label={`${gtpPoint(index, boardSize)} ${stoneLabel(stone)}`}
                  >
                    {stone && (
                      <span
                        aria-hidden="true"
                        className={[
                          'absolute left-1/2 top-1/2 block h-[72%] w-[72%] -translate-x-1/2 -translate-y-1/2 rounded-full shadow-md',
                          stone === 'black'
                            ? 'bg-gradient-to-br from-zinc-700 to-black'
                            : 'bg-gradient-to-br from-white to-zinc-200 ring-1 ring-black/20',
                        ].join(' ')}
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-[var(--ui-surface)] px-2 py-2">
                <div className="text-[11px] uppercase tracking-wide ui-text-faint">Black</div>
                <div className="text-sm font-semibold">{counts.black}</div>
              </div>
              <div className="rounded-lg bg-[var(--ui-surface)] px-2 py-2">
                <div className="text-[11px] uppercase tracking-wide ui-text-faint">White</div>
                <div className="text-sm font-semibold">{counts.white}</div>
              </div>
              <div className="rounded-lg bg-[var(--ui-surface)] px-2 py-2">
                <div className="text-[11px] uppercase tracking-wide ui-text-faint">Total</div>
                <div className="text-sm font-semibold">{counts.total}</div>
              </div>
            </div>
          </section>
        </div>

        <div className="ui-bar flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ui-border)] px-4 py-3">
          <button
            type="button"
            className="min-h-11 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-2 text-sm font-semibold text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
            onClick={clearBoard}
          >
            <span className="inline-flex items-center gap-2"><FaTrash /> Clear</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="min-h-11 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)]"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="min-h-11 rounded-lg border border-[var(--ui-accent)] bg-[var(--ui-accent)] px-4 py-2 text-sm font-semibold text-[var(--ui-accent-contrast)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={counts.total === 0}
              onClick={importBoard}
            >
              Import Position
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

PhotoBoardModal.displayName = 'PhotoBoardModal';
