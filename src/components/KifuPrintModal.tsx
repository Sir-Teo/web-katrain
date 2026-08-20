import React, { useEffect, useMemo, useState } from 'react';
import { FaTimes, FaPrint } from 'react-icons/fa';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useInitialDialogFocus } from '../hooks/useInitialDialogFocus';
import { StaticBoard, type StaticBoardMarker } from './StaticBoard';
import { getCurrentLineNodes } from '../utils/branchNavigation';
import { buildKifuDiagrams, type MovesPerDiagram } from '../utils/kifuDiagrams';
import { printWindow } from '../utils/print';
import { formatGameInfoPlayer, readRootInfoValue } from '../utils/gameInfoDisplay';
import type { GameNode } from '../types';

interface KifuPrintModalProps {
  onClose: () => void;
}

const MOVES_PER_DIAGRAM_OPTIONS: Array<{ value: MovesPerDiagram; label: string }> = [
  { value: 10, label: '10' },
  { value: 25, label: '25' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: 'all', label: 'All on one' },
];

function rootPropertiesForNode(node: GameNode): Record<string, string[]> {
  let root = node;
  while (root.parent) root = root.parent;
  return root.properties ?? {};
}

const KIFU_PRINT_STYLE = `
  @media print {
    @page { size: A4 portrait; margin: 12mm; }
    body > * { visibility: hidden !important; }
    .kifu-print, .kifu-print * { visibility: visible !important; }
    .kifu-print {
      position: absolute !important;
      left: 0 !important; top: 0 !important; width: 100% !important;
      background: #ffffff !important; color: #0f172a !important;
    }
    .kifu-print .kifu-controls { display: none !important; }
    .kifu-diagram-page {
      break-after: page !important; page-break-after: always !important;
      break-inside: avoid !important; page-break-inside: avoid !important;
    }
    .kifu-diagram-page:last-child { break-after: auto !important; page-break-after: auto !important; }
    .kifu-diagram-caption { color: #334155 !important; }
  }
`;

export const KifuPrintModal: React.FC<KifuPrintModalProps> = ({ onClose }) => {
  useEscapeToClose(onClose);
  const dialogRef = useInitialDialogFocus<HTMLDivElement>();
  const [movesPerDiagram, setMovesPerDiagram] = useState<MovesPerDiagram>(50);
  const { currentNode, activeBranchChildIds, treeVersion } = useGameStore(
    (state) => ({
      currentNode: state.currentNode,
      activeBranchChildIds: state.activeBranchChildIds,
      treeVersion: state.treeVersion,
    }),
    shallow
  );

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = KIFU_PRINT_STYLE;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const { diagrams, playerNames } = useMemo(() => {
    void treeVersion;
    const line = getCurrentLineNodes(currentNode, activeBranchChildIds);
    const moveNodes = line.filter((node) => node.move != null);
    const rootProps = rootPropertiesForNode(currentNode);
    return {
      diagrams: buildKifuDiagrams(moveNodes, movesPerDiagram),
      playerNames: {
        black: formatGameInfoPlayer(readRootInfoValue(rootProps, 'PB'), readRootInfoValue(rootProps, 'BR'), 'Black'),
        white: formatGameInfoPlayer(readRootInfoValue(rootProps, 'PW'), readRootInfoValue(rootProps, 'WR'), 'White'),
      },
    };
  }, [activeBranchChildIds, currentNode, movesPerDiagram, treeVersion]);

  const toStaticMarkers = (markers: { x: number; y: number; text: string; player: 'black' | 'white' }[]): StaticBoardMarker[] =>
    markers.map((m) => ({
      x: m.x,
      y: m.y,
      text: m.text,
      kind: 'label',
      color: m.player === 'black' ? '#0b0b0b' : '#f9fafb',
      textColor: m.player === 'black' ? '#f9fafb' : '#0b0b0b',
    }));

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kifu-print-title"
    >
      <div className="kifu-print ui-panel flex max-h-[92dvh] w-[92vw] max-w-3xl flex-col overflow-hidden rounded-2xl border shadow-2xl">
        <div className="kifu-controls relative flex flex-col items-stretch gap-3 border-b border-[var(--ui-border)] px-4 py-3 ui-bar sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
          <div className="min-w-0 pr-12 sm:pr-0">
            <div className="text-xs uppercase tracking-[0.2em] ui-text-faint">Print kifu</div>
            <h2 id="kifu-print-title" className="text-lg font-semibold text-[var(--ui-text)]">
              <span className="sr-only">Print Kifu: </span>
              {playerNames.black} vs {playerNames.white}
            </h2>
          </div>
          <div className="flex min-w-0 w-full items-center gap-2 sm:w-auto">
            <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-lg border border-[var(--ui-border)] sm:flex-none" role="group" aria-label="Moves per diagram">
              {MOVES_PER_DIAGRAM_OPTIONS.map((opt) => {
                const active = movesPerDiagram === opt.value;
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => setMovesPerDiagram(opt.value)}
                    aria-pressed={active}
                    className={[
                      'min-w-0 flex-1 px-2 py-2 text-sm font-semibold sm:flex-none sm:px-3',
                      active ? 'bg-[var(--ui-accent-soft)] text-[var(--ui-accent)]' : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)]',
                    ].join(' ')}
                  >
                    {opt.value === 'all' ? (
                      <>
                        <span className="sm:hidden">All</span>
                        <span className="hidden sm:inline">{opt.label}</span>
                      </>
                    ) : opt.label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => printWindow()}
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-lg ui-accent-bg px-3 py-2 text-sm font-semibold hover:brightness-110"
              aria-label="Print kifu or save as PDF"
            >
              <FaPrint aria-hidden="true" /> <span className="hidden lg:inline">Print / PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="ui-control absolute right-3 top-3 grid shrink-0 place-items-center rounded-lg text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)] sm:static"
              aria-label="Close kifu print"
            >
              <FaTimes aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-5">
          <div className="kifu-controls mb-4 text-xs ui-text-muted">
            {diagrams.length === 0
              ? 'No moves to print yet.'
              : `${diagrams.length} diagram${diagrams.length === 1 ? '' : 's'} · ${movesPerDiagram === 'all' ? 'all moves on one board' : `${movesPerDiagram} moves per diagram`}.`}
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {diagrams.map((diagram) => (
              <div key={diagram.index} className="kifu-diagram-page flex flex-col items-center">
                <div className="kifu-diagram-caption mb-2 text-sm font-semibold text-[var(--ui-text)]">
                  {diagram.startMove === diagram.endMove
                    ? `Move ${diagram.startMove}`
                    : `Moves ${diagram.startMove}–${diagram.endMove}`}
                </div>
                <StaticBoard
                  board={diagram.board}
                  markers={toStaticMarkers(diagram.markers)}
                  showCoordinates
                  maxPx={360}
                  ariaLabel={`Kifu diagram moves ${diagram.startMove} to ${diagram.endMove}`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

KifuPrintModal.displayName = 'KifuPrintModal';
