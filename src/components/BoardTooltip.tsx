import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { getBoardTooltipPlacement } from '../utils/boardTooltipPlacement';
import { getResizeObserverConstructor } from '../utils/resizeObserver';

type Bounds = {
  boardLeft: number; boardTop: number; boardWidth: number; boardHeight: number;
  containerWidth: number; containerHeight: number;
};

/** Keep hover details in the board stage, clear of the variation when a side margin fits. */
export function BoardTooltip({ boardRef, anchorX, anchorY, cellSize, children, stoneMoveNumber }: {
  boardRef: RefObject<HTMLDivElement | null>;
  anchorX: number;
  anchorY: number;
  cellSize: number;
  children: ReactNode;
  stoneMoveNumber?: number;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [height, setHeight] = useState(0);
  const [gutterFits, setGutterFits] = useState(true);

  useLayoutEffect(() => {
    const board = boardRef.current;
    const stage = board?.closest<HTMLElement>('.board-stage') ?? board?.parentElement;
    if (!board || !stage) return;
    const update = () => {
      setHost(stage);
      const b = board.getBoundingClientRect(), s = stage.getBoundingClientRect();
      const next: Bounds = {
        boardLeft: b.left - s.left, boardTop: b.top - s.top, boardWidth: b.width, boardHeight: b.height,
        containerWidth: s.width, containerHeight: s.height,
      };
      setBounds(previous => previous && Object.keys(next).every(key => previous[key as keyof Bounds] === next[key as keyof Bounds]) ? previous : next);
      setGutterFits(true);
    };
    update();
    const Observer = getResizeObserverConstructor();
    const observer = Observer ? new Observer(update) : null;
    observer?.observe(board);
    observer?.observe(stage);
    return () => observer?.disconnect();
  }, [boardRef]);

  const placement = bounds ? getBoardTooltipPlacement({ ...bounds, anchorX, anchorY, cellSize, tooltipHeight: height, allowGutter: gutterFits }) : null;
  // Measure before paint. A narrow margin can make a long PV too tall; retain
  // the normal board placement for that card rather than clipping its text.
  useLayoutEffect(() => {
    const element = tooltipRef.current;
    if (!element || !bounds) return;
    const measure = () => {
      const measured = element.getBoundingClientRect().height;
      setHeight(previous => previous === measured ? previous : measured);
      if (placement?.region === 'gutter' && measured > bounds.containerHeight - 16) setGutterFits(false);
    };
    measure();
    const Observer = getResizeObserverConstructor();
    const observer = Observer ? new Observer(measure) : null;
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [children, bounds, placement?.maxWidth, placement?.region]);

  if (!host || !placement) return null;
  return createPortal(
    <div
      ref={tooltipRef}
      className={`absolute z-20 w-max rounded-lg border border-[var(--ui-border-strong)] bg-[var(--ui-panel)] text-xs text-[var(--ui-text)] shadow-xl pointer-events-none ${stoneMoveNumber === undefined ? 'p-2' : 'px-2 py-1'}`}
      style={{ left: placement.left, top: placement.top, transform: placement.transform, minWidth: stoneMoveNumber === undefined ? placement.minWidth : undefined, maxWidth: placement.maxWidth }}
      data-board-tooltip={stoneMoveNumber === undefined ? 'candidate' : 'stone'}
      data-board-tooltip-region={placement.region}
      data-stone-move-tooltip={stoneMoveNumber}
    >
      {children}
    </div>, host,
  );
}
