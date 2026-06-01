import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { FaArrowsAltH, FaArrowsAltV, FaCompressArrowsAlt, FaCrosshairs, FaMapMarkedAlt } from 'react-icons/fa';
import { useGameStore } from '../store/gameStore';
import type { GameNode } from '../types';
import {
  MOVE_TREE_LAYOUT_WORKER_THRESHOLD,
  computeMoveTreeLayout,
  flattenMoveTree,
  getMoveTreeMinimapViewportRect,
  getMoveTreeMinimapTransform,
  getMoveTreeMinimapKeyboardScroll,
  getVisibleMoveTreeItems,
  shouldShowMoveTreeMinimap,
  type MoveTreeLayout,
  type MoveTreeLayoutDirection,
  type MoveTreeViewport,
} from '../utils/moveTreeLayout';
import { readLocalStorage, writeLocalStorage } from '../utils/storage';
import { getWorkerConstructor } from '../utils/browserWorker';
import { getResizeObserverConstructor } from '../utils/resizeObserver';
import { cancelAnimationFrameSafe, requestAnimationFrameSafe, type AnimationFrameHandle } from '../utils/animationFrame';
import {
  getMoveTreeNodeMarkers,
  MOVE_TREE_NODE_MARKER_LABELS,
} from '../utils/moveTreeNodeMarkers';
import {
  getMoveTreeKeyboardTarget,
  isMoveTreeKeyboardNavigationKey,
} from '../utils/moveTreeKeyboard';

type LayoutWorkerResponse =
  | { requestId: number; ok: true; layout: MoveTreeLayout }
  | { requestId: number; ok: false; error: string };

const EMPTY_VIEWPORT: MoveTreeViewport = { left: 0, top: 0, width: 640, height: 220 };
const MINIMAP_SIZE = { width: 156, height: 88 };
const MINIMAP_STORAGE_KEY = 'web-katrain:move_tree_minimap:v1';
const LAYOUT_DIRECTION_STORAGE_KEY = 'web-katrain:move_tree_layout_direction:v1';

function indexNodes(root: GameNode): Map<string, GameNode> {
  const map = new Map<string, GameNode>();
  const stack: GameNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    map.set(node.id, node);
    for (let i = node.children.length - 1; i >= 0; i--) {
      stack.push(node.children[i]!);
    }
  }
  return map;
}

export const MoveTree: React.FC<{ onSelectNode?: (node: GameNode) => void }> = ({ onSelectNode }) => {
  const { rootNode, currentNode, jumpToNode, treeVersion, isInsertMode, mistakeThreshold } = useGameStore(
    (state) => ({
      rootNode: state.rootNode,
      currentNode: state.currentNode,
      jumpToNode: state.jumpToNode,
      treeVersion: state.treeVersion,
      isInsertMode: state.isInsertMode,
      mistakeThreshold: state.settings.mistakeThreshold,
    }),
    shallow
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeElementRefs = useRef(new Map<string, SVGGElement>());
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const [workerResult, setWorkerResult] = useState<{
    key: string;
    layout: MoveTreeLayout;
    status: 'worker' | 'fallback';
  } | null>(null);
  const [viewport, setViewport] = useState<MoveTreeViewport>(EMPTY_VIEWPORT);
  const [showMinimap, setShowMinimap] = useState(() => {
    return readLocalStorage(MINIMAP_STORAGE_KEY) !== 'false';
  });
  const [layoutDirection, setLayoutDirection] = useState<MoveTreeLayoutDirection>(() => {
    return readLocalStorage(LAYOUT_DIRECTION_STORAGE_KEY) === 'vertical' ? 'vertical' : 'horizontal';
  });
  const [keyboardFocusedNodeId, setKeyboardFocusedNodeId] = useState<string | null>(null);

  const flatTree = useMemo(() => {
    void treeVersion;
    return flattenMoveTree(rootNode);
  }, [rootNode, treeVersion]);

  const nodeById = useMemo(() => {
    void treeVersion;
    return indexNodes(rootNode);
  }, [rootNode, treeVersion]);

  const workerAvailable = getWorkerConstructor() !== null;
  const shouldUseWorker = workerAvailable && flatTree.length >= MOVE_TREE_LAYOUT_WORKER_THRESHOLD;
  const layoutKey = `${rootNode.id}:${treeVersion}:${flatTree.length}:${layoutDirection}`;
  const syncLayout = useMemo(
    () => (shouldUseWorker ? null : computeMoveTreeLayout(flatTree, layoutDirection)),
    [flatTree, layoutDirection, shouldUseWorker]
  );
  const workerLayout = shouldUseWorker && workerResult?.key === layoutKey ? workerResult.layout : null;
  const layout = syncLayout ?? workerLayout;
  const layoutStatus = shouldUseWorker
    ? workerResult?.key === layoutKey
      ? workerResult.status
      : 'working'
    : 'sync';

  const centerCurrentNode = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const container = containerRef.current;
    const activeLayout = syncLayout ?? (shouldUseWorker && workerResult?.key === layoutKey ? workerResult.layout : null);
    if (!container || !activeLayout) return;
    const pos = activeLayout.nodes.find((node) => node.id === currentNode.id);
    if (!pos) return;
    const targetLeft = Math.max(0, pos.x - container.clientWidth * 0.5);
    const targetTop = Math.max(0, pos.y - container.clientHeight * 0.5);
    container.scrollTo({ left: targetLeft, top: targetTop, behavior });
  }, [currentNode.id, layoutKey, shouldUseWorker, syncLayout, workerResult]);

  const setNodeElementRef = useCallback((id: string, element: SVGGElement | null) => {
    if (element) nodeElementRefs.current.set(id, element);
    else nodeElementRefs.current.delete(id);
  }, []);

  const focusTreeNode = useCallback((id: string) => {
    const tryFocus = (attempt = 0) => {
      requestAnimationFrameSafe(() => {
        const element = nodeElementRefs.current.get(id);
        if (element) {
          element.focus({ preventScroll: true });
        } else if (attempt < 4) {
          tryFocus(attempt + 1);
        }
      });
    };
    tryFocus();
  }, []);

  const selectTreeNode = useCallback(
    (node: GameNode, focusAfterSelect = false) => {
      if (isInsertMode) return;
      jumpToNode(node);
      onSelectNode?.(node);
      if (focusAfterSelect) {
        setKeyboardFocusedNodeId(node.id);
        focusTreeNode(node.id);
      }
    },
    [focusTreeNode, isInsertMode, jumpToNode, onSelectNode]
  );

  useEffect(() => {
    writeLocalStorage(MINIMAP_STORAGE_KEY, String(showMinimap));
  }, [showMinimap]);

  useEffect(() => {
    writeLocalStorage(LAYOUT_DIRECTION_STORAGE_KEY, layoutDirection);
  }, [layoutDirection]);

  useEffect(() => {
    if (!shouldUseWorker || !workerAvailable) return;

    const requestId = ++requestIdRef.current;
    const key = layoutKey;
    const applyFallback = () => {
      if (requestId !== requestIdRef.current) return;
      setWorkerResult({ key, layout: computeMoveTreeLayout(flatTree, layoutDirection), status: 'fallback' });
    };
    try {
      if (!workerRef.current) {
        workerRef.current = new Worker(new URL('../workers/moveTreeLayoutWorker.ts', import.meta.url), {
          type: 'module',
        });
      }
      const worker = workerRef.current;
      worker.onmessage = (event: MessageEvent<LayoutWorkerResponse>) => {
        const msg = event.data;
        if (msg.requestId !== requestIdRef.current) return;
        if (msg.ok) {
          setWorkerResult({ key, layout: msg.layout, status: 'worker' });
          return;
        }
        applyFallback();
      };
      worker.onerror = () => {
        applyFallback();
      };
      worker.postMessage({ requestId, items: flatTree, direction: layoutDirection });
    } catch {
      queueMicrotask(applyFallback);
    }
  }, [flatTree, layoutDirection, layoutKey, shouldUseWorker, workerAvailable]);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let frame: AnimationFrameHandle | null = null;
    const update = () => {
      cancelAnimationFrameSafe(frame);
      frame = requestAnimationFrameSafe(() => {
        frame = null;
        setViewport({
          left: container.scrollLeft,
          top: container.scrollTop,
          width: container.clientWidth || EMPTY_VIEWPORT.width,
          height: container.clientHeight || EMPTY_VIEWPORT.height,
        });
      });
    };

    update();
    container.addEventListener('scroll', update, { passive: true });
    const ResizeObserverConstructor = getResizeObserverConstructor();
    const resizeObserver = ResizeObserverConstructor ? new ResizeObserverConstructor(update) : null;
    resizeObserver?.observe(container);
    return () => {
      cancelAnimationFrameSafe(frame);
      container.removeEventListener('scroll', update);
      resizeObserver?.disconnect();
    };
  }, []);

  useEffect(() => {
    centerCurrentNode('smooth');
  }, [centerCurrentNode]);

  const visible = useMemo(() => (layout ? getVisibleMoveTreeItems(layout, viewport) : null), [layout, viewport]);
  const minimapViewport = useMemo(
    () => (layout ? getMoveTreeMinimapViewportRect(layout, viewport, MINIMAP_SIZE) : null),
    [layout, viewport]
  );
  const minimapTransform = useMemo(() => (layout ? getMoveTreeMinimapTransform(layout, MINIMAP_SIZE) : null), [layout]);
  const shouldRenderMinimap = useMemo(
    () => (layout ? shouldShowMoveTreeMinimap(layout, viewport, MINIMAP_SIZE) : false),
    [layout, viewport]
  );

  const handleMinimapClick = (event: React.MouseEvent<SVGSVGElement>) => {
    const container = containerRef.current;
    if (!container || !layout || !minimapTransform) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const { scale, offsetX, offsetY } = minimapTransform;
    const x = Math.max(0, Math.min(layout.width, (event.clientX - rect.left - offsetX) / scale));
    const y = Math.max(0, Math.min(layout.height, (event.clientY - rect.top - offsetY) / scale));
    container.scrollTo({
      left: Math.max(0, x - container.clientWidth / 2),
      top: Math.max(0, y - container.clientHeight / 2),
      behavior: 'smooth',
    });
  };
  const handleMinimapKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    const container = containerRef.current;
    if (!container || !layout) return;

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      centerCurrentNode('smooth');
      return;
    }

    const nextScroll = getMoveTreeMinimapKeyboardScroll(layout, viewport, event.key);
    if (!nextScroll) return;
    event.preventDefault();
    event.stopPropagation();
    container.scrollTo({ ...nextScroll, behavior: 'smooth' });
  };
  const nextLayoutDirection = layoutDirection === 'horizontal' ? 'vertical' : 'horizontal';
  const layoutDirectionLabel =
    layoutDirection === 'horizontal' ? 'Switch tree to vertical layout' : 'Switch tree to horizontal layout';

  if (!layout || !visible) {
    return (
      <div ref={containerRef} className="relative w-full h-full min-h-28 overflow-auto ui-surface">
        <div className="absolute inset-0 grid place-items-center text-[11px] uppercase tracking-wide ui-text-muted">
          Laying out move tree
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-auto ui-surface" data-tree-layout={layoutStatus}>
      <div className="move-tree-floating-controls">
        <button
          type="button"
          className="move-tree-control-button"
          onClick={() => centerCurrentNode('smooth')}
          title="Center current move"
          aria-label="Center current move"
        >
          <FaCrosshairs size={11} />
        </button>
        <button
          type="button"
          className={['move-tree-control-button', layoutDirection === 'vertical' ? 'active' : ''].join(' ')}
          onClick={() => setLayoutDirection(nextLayoutDirection)}
          title={layoutDirectionLabel}
          aria-label={layoutDirectionLabel}
          aria-pressed={layoutDirection === 'vertical'}
        >
          {layoutDirection === 'horizontal' ? <FaArrowsAltV size={11} /> : <FaArrowsAltH size={11} />}
        </button>
        {shouldRenderMinimap && (
          <button
            type="button"
            className={['move-tree-control-button', showMinimap ? 'active' : ''].join(' ')}
            onClick={() => setShowMinimap((prev) => !prev)}
            title={showMinimap ? 'Hide tree map' : 'Show tree map'}
            aria-label={showMinimap ? 'Hide tree map' : 'Show tree map'}
            aria-pressed={showMinimap}
          >
            {showMinimap ? <FaCompressArrowsAlt size={11} /> : <FaMapMarkedAlt size={11} />}
          </button>
        )}
      </div>
      <svg
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="tree"
        aria-label="Game tree"
        data-move-tree="true"
      >
        {visible.edges.map((l) => (
          <polyline
            key={l.id}
            points={l.points}
            fill="none"
            stroke="#9CA3AF"
            strokeWidth="1"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {visible.nodes.map((layoutNode) => {
          const node = nodeById.get(layoutNode.id);
          const isCurrent = layoutNode.id === currentNode.id;
          const isKeyboardFocused = keyboardFocusedNodeId === layoutNode.id;
          const isAutoUndone = layoutNode.autoUndo === true;
          const isRoot = layoutNode.isRoot;
          const isBlack = layoutNode.player === 'black';
          const fill = isRoot ? 'none' : isBlack ? '#0B0B0B' : '#F9FAFB';
          const stroke = isRoot ? '#9CA3AF' : isBlack ? '#F9FAFB' : '#0B0B0B';
          const markers = getMoveTreeNodeMarkers(node, mistakeThreshold);
          const markerRadius = Math.max(2, Math.min(3.25, layout.radius * 0.22));
          const markerGap = markerRadius * 2.35;
          const markerY = layoutNode.y + layout.radius * 0.62;
          const markerStartX = layoutNode.x - ((markers.length - 1) * markerGap) / 2;
          const markerTitle = markers.map((marker) => MOVE_TREE_NODE_MARKER_LABELS[marker]).join(', ');

          const selectableNode = !isInsertMode && node ? node : null;
          const keyboardLabel = [
            isRoot ? 'Root' : `Move ${layoutNode.label}`,
            markerTitle,
            isCurrent ? 'current move' : '',
          ].filter(Boolean).join(', ');

          const handleKeyDown = (event: React.KeyboardEvent<SVGGElement>) => {
            if (!selectableNode) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              selectTreeNode(selectableNode, true);
              return;
            }
            if (!isMoveTreeKeyboardNavigationKey(event.key)) return;
            event.preventDefault();
            event.stopPropagation();
            const target = getMoveTreeKeyboardTarget({
              node: selectableNode,
              root: rootNode,
              direction: layoutDirection,
              key: event.key,
            });
            if (target) selectTreeNode(target, true);
          };

          return (
            <g
              key={layoutNode.id}
              ref={(element) => setNodeElementRef(layoutNode.id, element)}
              role="treeitem"
              aria-label={keyboardLabel}
              aria-current={isCurrent ? 'true' : undefined}
              aria-level={layoutNode.gridX + 1}
              tabIndex={selectableNode && isCurrent ? 0 : -1}
              data-move-tree-node="true"
              data-move-tree-node-current={isCurrent ? 'true' : undefined}
              data-move-tree-node-label={layoutNode.label}
              style={{ cursor: selectableNode ? 'pointer' : 'default', outline: 'none' }}
              onClick={() => {
                if (selectableNode) selectTreeNode(selectableNode);
              }}
              onFocus={() => setKeyboardFocusedNodeId(layoutNode.id)}
              onBlur={() => setKeyboardFocusedNodeId((id) => (id === layoutNode.id ? null : id))}
              onKeyDown={handleKeyDown}
            >
              {isAutoUndone && (
                <circle cx={layoutNode.x} cy={layoutNode.y} r={layout.radius + 4} fill="none" stroke="#EF4444" strokeWidth="2" />
              )}
              {isKeyboardFocused && (
                <circle
                  cx={layoutNode.x}
                  cy={layoutNode.y}
                  r={layout.radius + 10}
                  className="move-tree-keyboard-focus"
                />
              )}
              {isCurrent && (
                <circle cx={layoutNode.x} cy={layoutNode.y} r={layout.radius + 7} fill="none" stroke="#FACC15" strokeWidth="2" />
              )}
              <circle
                cx={layoutNode.x}
                cy={layoutNode.y}
                r={layout.radius}
                fill={fill}
                stroke={stroke}
                strokeWidth="1"
              >
                <title>{markerTitle ? `${layoutNode.label} - ${markerTitle}` : layoutNode.label}</title>
              </circle>
              {markers.map((marker, index) => (
                <circle
                  key={marker}
                  cx={markerStartX + index * markerGap}
                  cy={markerY}
                  r={markerRadius}
                  className={['move-tree-node-marker', marker].join(' ')}
                >
                  <title>{MOVE_TREE_NODE_MARKER_LABELS[marker]}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      {layoutStatus === 'working' && (
        <div className="pointer-events-none sticky bottom-1 left-1 inline-flex rounded bg-[var(--ui-surface)]/90 px-2 py-1 text-[10px] uppercase tracking-wide ui-text-muted">
          Laying out {flatTree.length} nodes
        </div>
      )}
      {showMinimap && shouldRenderMinimap && minimapViewport && minimapTransform && (
        <div className="move-tree-minimap" data-move-tree-minimap="true">
          <svg
            width={MINIMAP_SIZE.width}
            height={MINIMAP_SIZE.height}
            viewBox={`0 0 ${MINIMAP_SIZE.width} ${MINIMAP_SIZE.height}`}
            onClick={handleMinimapClick}
            onKeyDown={handleMinimapKeyDown}
            tabIndex={0}
            role="group"
            aria-roledescription="interactive minimap"
            aria-label="Move tree minimap. Arrow keys pan, Enter centers current move."
          >
            <rect x="0" y="0" width={MINIMAP_SIZE.width} height={MINIMAP_SIZE.height} rx="6" className="move-tree-minimap-bg" />
            <g transform={`translate(${minimapTransform.offsetX} ${minimapTransform.offsetY}) scale(${minimapTransform.scale})`}>
              {layout.edges.map((edge) => (
                <polyline key={edge.id} points={edge.points} className="move-tree-minimap-edge" />
              ))}
              {layout.nodes.map((node) => (
                <circle
                  key={node.id}
                  cx={node.x}
                  cy={node.y}
                  r={node.id === currentNode.id ? layout.radius + 2 : layout.radius}
                  className={[
                    'move-tree-minimap-node',
                    node.player === 'white' ? 'white' : node.player === 'black' ? 'black' : 'root',
                    node.id === currentNode.id ? 'current' : '',
                  ].join(' ')}
                />
              ))}
            </g>
            <rect
              x={minimapViewport.x}
              y={minimapViewport.y}
              width={minimapViewport.width}
              height={minimapViewport.height}
              rx="3"
              className="move-tree-minimap-viewport"
            />
          </svg>
        </div>
      )}
    </div>
  );
};
