import React from 'react';
import { FaCamera, FaEraser, FaFolderOpen, FaLayerGroup, FaPlay, FaTimes, FaTrash } from 'react-icons/fa';
import type { BoardSize, BoardState, Player } from '../types';
import { BOARD_SIZES } from '../utils/boardSize';
import {
  buildPhotoBoardSetupSgf,
  findPhotoBoardMoveDelta,
  photoBoardStonesFromBoard,
  type PhotoBoardMoveDelta,
  type PhotoBoardStone,
} from '../utils/photoBoard';

interface PhotoBoardModalProps {
  onClose: () => void;
  onImportSgf: (sgf: string) => void | Promise<void>;
  onAddSetupStones?: (stones: Array<{ x: number; y: number; player: Player }>, boardSize: BoardSize) => void | Promise<void>;
  onPlayMove?: (x: number, y: number) => void | Promise<void>;
  defaultBoardSize: BoardSize;
  defaultKomi: number;
  currentBoard?: BoardState;
  currentPlayer?: Player;
  initialPhotoFile?: File | null;
}

type TraceTool = Player | 'erase';
type PhotoFit = 'cover' | 'contain';

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
  onAddSetupStones,
  onPlayMove,
  defaultBoardSize,
  defaultKomi,
  currentBoard,
  currentPlayer,
  initialPhotoFile = null,
}) => {
  const galleryInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const photoUrlRef = React.useRef<string | null>(null);
  const [boardSize, setBoardSize] = React.useState<BoardSize>(defaultBoardSize);
  const [komi, setKomi] = React.useState(defaultKomi);
  const [nextPlayer, setNextPlayer] = React.useState<Player>(() => currentPlayer ?? 'black');
  const [tool, setTool] = React.useState<TraceTool>(() => currentPlayer ?? 'black');
  const [stones, setStones] = React.useState<PhotoBoardStone[]>(() => makeEmptyStones(defaultBoardSize));
  const [photoUrl, setPhotoUrl] = React.useState<string | null>(null);
  const [photoName, setPhotoName] = React.useState<string>('');
  const [photoUnderlay, setPhotoUnderlay] = React.useState(true);
  const [photoOpacity, setPhotoOpacity] = React.useState(0.45);
  const [photoFit, setPhotoFit] = React.useState<PhotoFit>('cover');

  const currentBoardSize = React.useMemo<BoardSize | null>(() => {
    const size = currentBoard?.length;
    return BOARD_SIZES.includes(size as BoardSize) ? (size as BoardSize) : null;
  }, [currentBoard]);

  const currentBoardStones = React.useMemo<PhotoBoardStone[] | null>(() => {
    if (!currentBoard || !currentBoardSize) return null;
    try {
      return photoBoardStonesFromBoard(currentBoard, currentBoardSize);
    } catch {
      return null;
    }
  }, [currentBoard, currentBoardSize]);

  const currentBoardStoneCount = React.useMemo(
    () => currentBoardStones?.reduce((sum, stone) => sum + (stone ? 1 : 0), 0) ?? 0,
    [currentBoardStones]
  );
  const canUseCurrentBoard = currentBoardStoneCount > 0;

  const playMoveDelta = React.useMemo<PhotoBoardMoveDelta | null>(() => {
    if (!onPlayMove || !currentBoard || !currentPlayer) return null;
    return findPhotoBoardMoveDelta({ currentBoard, boardSize, stones, currentPlayer });
  }, [boardSize, currentBoard, currentPlayer, onPlayMove, stones]);

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

  const tracedSetupStones = React.useMemo(
    () =>
      stones.flatMap((stone, index) => {
        if (!stone) return [];
        return [{ x: index % boardSize, y: Math.floor(index / boardSize), player: stone }];
      }),
    [boardSize, stones]
  );

  const canAddToCurrent = !!onAddSetupStones && counts.total > 0 && currentBoardSize === boardSize;
  const addToCurrentTitle =
    counts.total === 0
      ? 'Trace at least one stone to add it to the current board'
      : currentBoardSize !== boardSize
        ? `Current board is ${currentBoardSize ?? '?'}x${currentBoardSize ?? '?'}, not ${boardSize}x${boardSize}`
        : 'Add traced stones as setup stones on the current board';

  const choosePhoto = React.useCallback((file: File | undefined) => {
    if (!file) return;
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    const objectUrl = URL.createObjectURL(file);
    photoUrlRef.current = objectUrl;
    setPhotoName(file.name || 'Camera photo');
    setPhotoUrl(objectUrl);
    setPhotoUnderlay(true);
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

  const useCurrentBoard = () => {
    if (!currentBoardSize || !currentBoardStones || !canUseCurrentBoard) return;
    setBoardSize(currentBoardSize);
    setStones(currentBoardStones);
  };

  const importBoard = () => {
    const sgf = buildPhotoBoardSetupSgf({
      boardSize,
      stones,
      komi,
      nextPlayer,
      sourceName: photoName,
    });
    void onImportSgf(sgf);
  };

  const addToCurrent = () => {
    if (!onAddSetupStones || !canAddToCurrent) return;
    void onAddSetupStones(tracedSetupStones, boardSize);
  };

  const playMove = () => {
    if (!onPlayMove || !playMoveDelta) return;
    void onPlayMove(playMoveDelta.x, playMoveDelta.y);
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

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="min-h-10 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canUseCurrentBoard}
                onClick={useCurrentBoard}
                title={
                  canUseCurrentBoard
                    ? `Copy ${currentBoardStoneCount} current stone${currentBoardStoneCount === 1 ? '' : 's'} into the trace grid`
                    : 'No current stones to copy'
                }
              >
                <span className="inline-flex items-center gap-2">
                  <FaLayerGroup aria-hidden="true" /> Use current
                </span>
              </button>
              {currentBoardStoneCount > 0 && (
                <span className="text-xs font-medium text-[var(--ui-text-muted)]">
                  {currentBoardStoneCount} current stone{currentBoardStoneCount === 1 ? '' : 's'}
                </span>
              )}
            </div>

            <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm font-medium text-[var(--ui-text)]">
                  <input
                    type="checkbox"
                    checked={!!photoUrl && photoUnderlay}
                    disabled={!photoUrl}
                    onChange={(event) => setPhotoUnderlay(event.target.checked)}
                    className="h-4 w-4 accent-[var(--ui-accent)] disabled:opacity-50"
                  />
                  Photo under grid
                </label>
                <label className="ml-auto flex items-center gap-2 text-sm">
                  <span className="ui-text-muted">Fit</span>
                  <select
                    value={photoFit}
                    onChange={(event) => setPhotoFit(event.target.value as PhotoFit)}
                    disabled={!photoUrl || !photoUnderlay}
                    className="ui-input rounded border px-2 py-1 text-sm text-[var(--ui-text)] disabled:opacity-50"
                    aria-label="Photo underlay fit"
                  >
                    <option value="cover">Cover</option>
                    <option value="contain">Contain</option>
                  </select>
                </label>
              </div>
              <label className="mt-3 grid grid-cols-[auto_minmax(0,1fr)_3rem] items-center gap-2 text-xs">
                <span className="ui-text-muted">Opacity</span>
                <input
                  type="range"
                  min={0.15}
                  max={0.85}
                  step={0.05}
                  value={photoOpacity}
                  disabled={!photoUrl || !photoUnderlay}
                  onChange={(event) => setPhotoOpacity(Number(event.target.value))}
                  className="w-full accent-[var(--ui-accent)] disabled:opacity-50"
                  aria-label="Photo underlay opacity"
                />
                <span className="text-right font-mono text-[var(--ui-text-muted)]">
                  {Math.round(photoOpacity * 100)}%
                </span>
              </label>
            </div>

            <div className="mx-auto w-full max-w-[min(78vh,640px)] rounded-lg border border-[var(--ui-border)] bg-[#c89a55] p-2 shadow-inner">
              <div
                className="relative overflow-hidden rounded border border-black/35 bg-[#d7ad68]"
                aria-label={`${boardSize} by ${boardSize} trace board`}
              >
                {photoUrl && photoUnderlay && (
                  <img
                    src={photoUrl}
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    style={{ opacity: photoOpacity, objectFit: photoFit }}
                  />
                )}
                <div
                  className="relative z-10 grid"
                  style={{ gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))` }}
                >
                  {stones.map((stone, index) => (
                    <button
                      key={`${boardSize}-${index}`}
                      type="button"
                      className={[
                        'relative aspect-square border border-black/25 focus:z-10 focus:outline-none focus:ring-2 focus:ring-[var(--ui-accent)]',
                        photoUrl && photoUnderlay
                          ? 'bg-[#d7ad68]/45 hover:bg-[#e5bd78]/60'
                          : 'bg-[#d7ad68] hover:bg-[#e5bd78]',
                      ].join(' ')}
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
            {onPlayMove && (
              <button
                type="button"
                className="min-h-11 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!playMoveDelta}
                onClick={playMove}
                title={
                  playMoveDelta
                    ? `Play ${playMoveDelta.player} at ${gtpPoint(playMoveDelta.y * boardSize + playMoveDelta.x, boardSize)}`
                    : 'Trace exactly one next-player stone to play it as a move'
                }
              >
                <span className="inline-flex items-center gap-2">
                  <FaPlay aria-hidden="true" /> Play Move
                </span>
              </button>
            )}
            {onAddSetupStones && (
              <button
                type="button"
                className="min-h-11 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-4 py-2 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canAddToCurrent}
                onClick={addToCurrent}
                title={addToCurrentTitle}
              >
                <span className="inline-flex items-center gap-2">
                  <FaLayerGroup aria-hidden="true" /> Add to Current
                </span>
              </button>
            )}
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
