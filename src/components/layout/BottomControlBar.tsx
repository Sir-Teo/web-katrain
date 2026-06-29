import React, { useEffect, useRef, useState } from 'react';
import {
  FaCheckCircle,
  FaExclamationTriangle,
  FaStepBackward,
  FaFastBackward,
  FaChevronLeft,
  FaChevronRight,
  FaChevronUp,
  FaChevronDown,
  FaFastForward,
  FaStepForward,
  FaSyncAlt,
  FaEllipsisH,
  FaUndo,
  FaRobot,
  FaFlag,
  FaEdit,
  FaCalculator,
} from 'react-icons/fa';
import type { Player } from '../../types';
import { IconButton } from './ui';
import { STONE_SIZE } from './types';
import { publicUrl } from '../../utils/publicUrl';
import { useShortcutLabels } from '../../hooks/useShortcutLabels';
import { formatGameInfoPlayer } from '../../utils/gameInfoDisplay';
import { getResizeObserverConstructor } from '../../utils/resizeObserver';
import { parseIntegerDraft } from '../../utils/numberDraft';
import type { BranchInfo } from '../../utils/branchNavigation';
import { getSaveStatusDisplay, type AutoSaveStatus } from '../../utils/saveStatusDisplay';

const BOTTOM_CONTROL_SHORTCUT_IDS = [
  'pass',
  'nav-back',
  'nav-forward',
  'nav-start',
  'nav-end',
  'nav-back-10',
  'nav-forward-10',
  'branch-prev',
  'branch-next',
  'prev-mistake',
  'next-mistake',
  'rotate-board',
] as const;

type BottomControlShortcutId = (typeof BOTTOM_CONTROL_SHORTCUT_IDS)[number];

interface BottomControlBarProps {
  passTurn: () => void;
  navigateBack: () => void;
  navigateForward: () => void;
  navigateToMove: (moveNumber: number) => void;
  navigateStart: () => void;
  navigateEnd: () => void;
  branchInfo?: BranchInfo | null;
  switchBranch?: (direction: 1 | -1) => void;
  switchToBranchIndex?: (index: number) => void;
  findMistake: (dir: 'undo' | 'redo') => void;
  rotateBoard: () => void;
  currentPlayer: Player;
  currentMoveNumber: number;
  totalMovesInCurrentLine: number;
  boardSize: number;
  handicap: number;
  blackName?: string;
  whiteName?: string;
  blackRank?: string;
  whiteRank?: string;
  capturedBlack?: number;
  capturedWhite?: number;
  isInsertMode: boolean;
  passPolicyColor: string | null;
  passPv: { idx: number; player: Player } | null;
  jumpBack: (n: number) => void;
  jumpForward: (n: number) => void;
  isMobile?: boolean;
  onUndo?: () => void;
  onAiMove?: () => void;
  onResign?: () => void;
  unsavedChanges?: boolean;
  autoSaveStatus?: AutoSaveStatus | null;
  isEditMode?: boolean;
  scoringMode?: boolean;
  onToggleEdit?: () => void;
  onToggleScore?: () => void;
  editDisabled?: boolean;
  scoreDisabled?: boolean;
  editShortcut?: string;
  scoreShortcut?: string;
}

export const BottomControlBar: React.FC<BottomControlBarProps> = ({
  passTurn,
  navigateBack,
  navigateForward,
  navigateToMove,
  navigateStart,
  navigateEnd,
  branchInfo = null,
  switchBranch,
  switchToBranchIndex,
  findMistake,
  rotateBoard,
  currentPlayer,
  currentMoveNumber,
  totalMovesInCurrentLine,
  boardSize,
  handicap,
  blackName = 'Black',
  whiteName = 'White',
  blackRank = '',
  whiteRank = '',
  capturedBlack = 0,
  capturedWhite = 0,
  isInsertMode,
  passPolicyColor,
  passPv,
  jumpBack,
  jumpForward,
  isMobile = false,
  onUndo,
  onAiMove,
  onResign,
  unsavedChanges = false,
  autoSaveStatus = null,
  isEditMode = false,
  scoringMode = false,
  onToggleEdit,
  onToggleScore,
  editDisabled = false,
  scoreDisabled = false,
  editShortcut,
  scoreShortcut,
}) => {
  const passBtnRef = useRef<HTMLButtonElement>(null);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const moreCloseRef = useRef<HTMLButtonElement>(null);
  const [passBtnHeight, setPassBtnHeight] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreSheetId = React.useId();
  const moreSheetTitleId = React.useId();
  const [isMoveNumberEditing, setIsMoveNumberEditing] = useState(false);
  const [moveNumberDraft, setMoveNumberDraft] = useState('');
  const skipMoveNumberBlurCommit = useRef(false);
  const [isBranchIndexEditing, setIsBranchIndexEditing] = useState(false);
  const [branchIndexDraft, setBranchIndexDraft] = useState('');
  const skipBranchIndexBlurCommit = useRef(false);
  const shortcutLabels = useShortcutLabels(BOTTOM_CONTROL_SHORTCUT_IDS);
  const withShortcut = (label: string, id: BottomControlShortcutId) => `${label} (${shortcutLabels[id]})`;
  const showBranchControl = !!branchInfo?.hasBranches && !!switchBranch && !!switchToBranchIndex;
  const branchDepthLabel = showBranchControl && branchInfo && !branchInfo.isAtFork ? `+${branchInfo.depthFromBranchRoot}` : null;
  const branchTitle = showBranchControl && branchInfo
    ? branchInfo.isAtFork
      ? `Branch ${branchInfo.currentIndex} of ${branchInfo.totalBranches}`
      : `Branch ${branchInfo.currentIndex} of ${branchInfo.totalBranches}, ${branchInfo.depthFromBranchRoot} move${branchInfo.depthFromBranchRoot === 1 ? '' : 's'} into variation`
    : '';
  const blackPlayerLabel = formatGameInfoPlayer(blackName, blackRank, 'Black');
  const whitePlayerLabel = formatGameInfoPlayer(whiteName, whiteRank, 'White');
  const blackCaptures = capturedWhite;
  const whiteCaptures = capturedBlack;
  const currentPlayerLabel = currentPlayer === 'black' ? blackPlayerLabel : whitePlayerLabel;
  const currentCaptureCount = currentPlayer === 'black' ? blackCaptures : whiteCaptures;
  const currentPlayerName = currentPlayer === 'black' ? 'Black' : 'White';
  const matchupSummary = `Black: ${blackPlayerLabel}, ${blackCaptures} captured. White: ${whitePlayerLabel}, ${whiteCaptures} captured. ${currentPlayerName} to play.`;
  const metaDividerClass = 'mobile-bottom-meta-divider text-[var(--ui-text-faint)]';
  const activePlayerClass = 'text-[var(--ui-accent)] font-semibold';
  const inactivePlayerClass = 'text-[var(--ui-text-faint)]';
  const mobileSaveStatus = getSaveStatusDisplay(unsavedChanges, autoSaveStatus);
  const mobileSaveStatusClass = mobileSaveStatus
    ? mobileSaveStatus.tone === 'danger'
      ? 'border-[var(--ui-danger)] bg-[var(--ui-danger-soft)] text-[var(--ui-danger)]'
      : mobileSaveStatus.tone === 'success'
        ? 'border-[var(--ui-success)] bg-[var(--ui-success-soft)] text-[var(--ui-success)]'
        : mobileSaveStatus.tone === 'accent'
          ? 'border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] text-[var(--ui-accent)]'
          : 'border-[var(--ui-warning)] bg-[var(--ui-warning-soft)] text-[var(--ui-warning)]'
    : '';
  const mobileSaveStatusIcon = mobileSaveStatus
    ? mobileSaveStatus.state === 'saved'
      ? <FaCheckCircle size={9} aria-hidden="true" />
      : mobileSaveStatus.state === 'pending'
        ? <FaSyncAlt size={9} aria-hidden="true" className="animate-spin" />
        : <FaExclamationTriangle size={9} aria-hidden="true" />
    : null;

  useEffect(() => {
    const el = passBtnRef.current;
    if (!el) return;
    const update = () => setPassBtnHeight(el.getBoundingClientRect().height);
    update();
    const ResizeObserverConstructor = getResizeObserverConstructor();
    if (!ResizeObserverConstructor) return;
    const obs = new ResizeObserverConstructor(() => update());
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const closeMoreControls = React.useCallback(() => {
    setMoreOpen(false);
    if (typeof window !== 'undefined') {
      window.setTimeout(() => moreTriggerRef.current?.focus({ preventScroll: true }), 0);
    }
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    moreCloseRef.current?.focus({ preventScroll: true });
    const onDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-bottom-more]')) return;
      closeMoreControls();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMoreControls();
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [closeMoreControls, moreOpen]);

  const openMoveNumberEditor = () => {
    if (isInsertMode) return;
    setMoveNumberDraft(String(currentMoveNumber));
    setIsMoveNumberEditing(true);
  };

  const commitMoveNumberEdit = () => {
    const parsed = parseIntegerDraft(moveNumberDraft);
    if (parsed != null) {
      navigateToMove(parsed);
    } else {
      setMoveNumberDraft(String(currentMoveNumber));
    }
    setIsMoveNumberEditing(false);
  };

  const cancelMoveNumberEdit = () => {
    skipMoveNumberBlurCommit.current = true;
    setMoveNumberDraft(String(currentMoveNumber));
    setIsMoveNumberEditing(false);
  };

  const handleMoveNumberKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      cancelMoveNumberEdit();
      event.currentTarget.blur();
    }
  };

  const handleMoveNumberBlur = () => {
    if (skipMoveNumberBlurCommit.current) {
      skipMoveNumberBlurCommit.current = false;
      return;
    }
    commitMoveNumberEdit();
  };

  const openBranchIndexEditor = () => {
    if (!showBranchControl || !branchInfo || isInsertMode) return;
    setBranchIndexDraft(String(branchInfo.currentIndex));
    setIsBranchIndexEditing(true);
  };

  const commitBranchIndexEdit = () => {
    if (showBranchControl && branchInfo && switchToBranchIndex) {
      const parsed = parseIntegerDraft(branchIndexDraft);
      if (parsed != null && parsed >= 1) {
        switchToBranchIndex(parsed);
      } else {
        setBranchIndexDraft(String(branchInfo.currentIndex));
      }
    }
    setIsBranchIndexEditing(false);
  };

  const cancelBranchIndexEdit = () => {
    skipBranchIndexBlurCommit.current = true;
    if (branchInfo?.hasBranches) setBranchIndexDraft(String(branchInfo.currentIndex));
    setIsBranchIndexEditing(false);
  };

  const handleBranchIndexKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      cancelBranchIndexEdit();
      event.currentTarget.blur();
    }
  };

  const handleBranchIndexBlur = () => {
    if (skipBranchIndexBlurCommit.current) {
      skipBranchIndexBlurCommit.current = false;
      return;
    }
    commitBranchIndexEdit();
  };

  const renderBranchIndexButton = (compact = false) => {
    if (!showBranchControl || !branchInfo) return null;
    if (isBranchIndexEditing) {
      return (
        <span className={compact ? 'inline-flex items-center gap-0.5' : 'inline-flex items-center gap-1'}>
          <span className="ui-text-faint">{compact ? 'Br' : 'Branch'}</span>
          <input
            type="number"
            value={branchIndexDraft}
            onChange={(event) => setBranchIndexDraft(event.target.value)}
            onKeyDown={handleBranchIndexKeyDown}
            onBlur={handleBranchIndexBlur}
            onFocus={(event) => event.currentTarget.select()}
            aria-label="Branch number"
            inputMode="numeric"
            min={1}
            max={branchInfo.totalBranches}
            className={compact ? 'w-5 bg-transparent p-0 text-right text-[var(--ui-text)] outline-none' : 'w-6 bg-transparent p-0 text-right font-mono text-[var(--ui-text)] outline-none'}
            autoFocus
          />
          <span className="font-mono ui-text-faint">/{branchInfo.totalBranches}</span>
          {branchDepthLabel && <span className="font-mono text-[var(--ui-accent)]">{branchDepthLabel}</span>}
        </span>
      );
    }

    return (
      <button
        type="button"
        className={[
          compact
            ? 'inline-flex min-w-0 items-center gap-0.5 rounded px-1 font-mono hover:bg-[var(--ui-surface-2)] disabled:opacity-50'
            : 'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-left hover:bg-[var(--ui-surface-2)] disabled:cursor-not-allowed disabled:opacity-50',
        ].join(' ')}
        title={branchTitle}
        aria-label={branchTitle}
        onClick={compact ? () => setMoreOpen(true) : openBranchIndexEditor}
        disabled={isInsertMode}
        data-bottom-branch-chip={compact ? 'true' : undefined}
      >
        <span className="ui-text-faint">{compact ? 'Br' : 'Branch'}</span>
        <span className="font-mono text-[var(--ui-text)]">{branchInfo.currentIndex}/{branchInfo.totalBranches}</span>
        {branchDepthLabel && <span className="font-mono text-[var(--ui-accent)]">{branchDepthLabel}</span>}
      </button>
    );
  };

  if (isMobile) {
    return (
      <div className="ui-bar ui-bar-height ui-bar-pad border-t flex items-center gap-1.5 sm:gap-2 select-none">
        <div className="relative">
          {passPolicyColor && (
            <div
              className="absolute inset-y-0 left-1/2 -translate-x-1/2 pointer-events-none rounded-full"
              style={{ height: '100%', aspectRatio: '1 / 1', backgroundColor: passPolicyColor }}
            />
          )}
          <button type="button"
            ref={passBtnRef}
            className="relative min-h-11 min-w-11 px-2.5 py-1.5 sm:px-3 sm:py-2 bg-[var(--ui-surface-2)] hover:brightness-110 rounded-lg text-[11px] sm:text-xs font-medium text-[var(--ui-text)] transition-colors"
            onClick={passTurn}
            aria-label="Pass turn"
            title={withShortcut('Pass', 'pass')}
          >
            Pass
          </button>
          {passPv && (
            <div
              className="absolute pointer-events-none flex items-center justify-center"
              style={{
                left: '100%',
                top: '50%',
                width: passBtnHeight > 0 ? passBtnHeight : 32,
                height: passBtnHeight > 0 ? passBtnHeight : 32,
                transform: 'translate(0, -50%)',
                zIndex: 20,
              }}
            >
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `url('${publicUrl(`katrain/${passPv.player === 'black' ? 'B_stone.png' : 'W_stone.png'}`)}')`,
                  backgroundSize: 'contain',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                }}
              />
              <div
                className="font-bold"
                style={{
                  color: passPv.player === 'black' ? 'white' : 'black',
                  fontSize: passBtnHeight > 0 ? passBtnHeight / (2 * STONE_SIZE * 1.55) : 12,
                  lineHeight: 1,
                }}
              >
                {passPv.idx}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 flex items-center justify-center gap-1">
          <IconButton title={withShortcut('Back', 'nav-back')} onClick={navigateBack} disabled={isInsertMode}>
            <FaChevronLeft />
          </IconButton>
          <div
            className="mobile-bottom-meta min-w-0 max-w-full overflow-hidden px-2 py-1 rounded-md bg-[var(--ui-surface)] border border-[var(--ui-border)] text-[10px] sm:text-xs font-mono text-[var(--ui-text-muted)] flex items-center gap-1"
            title={matchupSummary}
            aria-label={matchupSummary}
          >
            <span className="mobile-bottom-turn-chip inline-flex min-w-0 items-center gap-1">
              <span
                className={['mobile-bottom-stone', currentPlayer === 'black' ? 'mobile-bottom-stone-black' : 'mobile-bottom-stone-white'].join(' ')}
                aria-hidden="true"
              />
              <span className="mobile-bottom-current-player min-w-0 truncate font-sans font-semibold text-[var(--ui-text)]">
                {currentPlayerLabel}
              </span>
              <span className="mobile-bottom-current-captures text-[var(--ui-text-faint)]">C{currentCaptureCount}</span>
            </span>
            <span className={`${metaDividerClass} mx-1`}>|</span>
            <span className="ui-text-faint">{boardSize}×{boardSize}</span>
            {handicap > 0 && (
              <>
                <span className={metaDividerClass}>·</span>
                <span className="ui-text-faint">H{handicap}</span>
              </>
            )}
            <span className={`${metaDividerClass} mx-1`}>|</span>
            {isMoveNumberEditing ? (
              <span className="inline-flex items-center gap-0.5">
                <span className="ui-text-faint">#</span>
                <input
                  type="number"
                  value={moveNumberDraft}
                  onChange={(event) => setMoveNumberDraft(event.target.value)}
                  onKeyDown={handleMoveNumberKeyDown}
                  onBlur={handleMoveNumberBlur}
                  onFocus={(event) => event.currentTarget.select()}
                  aria-label="Move number"
                  inputMode="numeric"
                  min={0}
                  max={totalMovesInCurrentLine}
                  className="w-6 bg-transparent p-0 text-right text-[var(--ui-text)] outline-none"
                  autoFocus
                />
              </span>
            ) : (
              <button
                type="button"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded px-2 font-mono text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)] disabled:opacity-50"
                title="Set move number"
                onClick={openMoveNumberEditor}
                disabled={isInsertMode}
              >
                #{currentMoveNumber}/{totalMovesInCurrentLine}
              </button>
            )}
            {showBranchControl && (
              <>
                <span className={metaDividerClass}>·</span>
                {renderBranchIndexButton(true)}
              </>
            )}
            {mobileSaveStatus && (
              <>
                <span className={metaDividerClass}>·</span>
                <span
                  className={[
                    'inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                    mobileSaveStatusClass,
                  ].join(' ')}
                  title={mobileSaveStatus.title}
                  aria-label={mobileSaveStatus.title}
                  data-mobile-save-status="true"
                  data-mobile-save-state={mobileSaveStatus.state}
                >
                  {mobileSaveStatusIcon}
                  <span>{mobileSaveStatus.compactLabel}</span>
                </span>
              </>
            )}
          </div>
          <IconButton title={withShortcut('Forward', 'nav-forward')} onClick={navigateForward} disabled={isInsertMode}>
            <FaChevronRight />
          </IconButton>
        </div>

        {(onToggleEdit || onToggleScore) && (
          <div className="flex items-center gap-1 sm:gap-1.5">
            {onToggleEdit && (
              <button
                type="button"
                onClick={onToggleEdit}
                disabled={editDisabled}
                aria-pressed={isEditMode}
                aria-label={editShortcut ? `Edit position (${editShortcut})` : 'Edit position'}
                title={editShortcut ? `Edit position (${editShortcut})` : 'Edit position'}
                data-bottom-edit-toggle="true"
                className={[
                  'min-h-11 min-w-11 flex items-center justify-center rounded-lg transition-colors touch-manipulation',
                  isEditMode
                    ? 'bg-[var(--ui-accent-soft,var(--ui-surface-2))] text-[var(--ui-accent)]'
                    : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]',
                  editDisabled ? 'opacity-40 cursor-not-allowed' : '',
                ].join(' ')}
              >
                <FaEdit size={15} />
              </button>
            )}
            {onToggleScore && (
              <button
                type="button"
                onClick={onToggleScore}
                disabled={scoreDisabled}
                aria-pressed={scoringMode}
                aria-label={scoreShortcut ? `Score position (${scoreShortcut})` : 'Score position'}
                title={scoreShortcut ? `Score position (${scoreShortcut})` : 'Score position'}
                data-bottom-score-toggle="true"
                className={[
                  'min-h-11 min-w-11 flex items-center justify-center rounded-lg transition-colors touch-manipulation',
                  scoringMode
                    ? 'bg-[var(--ui-accent-soft,var(--ui-surface-2))] text-[var(--ui-accent)]'
                    : 'text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]',
                  scoreDisabled ? 'opacity-40 cursor-not-allowed' : '',
                ].join(' ')}
              >
                <FaCalculator size={15} />
              </button>
            )}
          </div>
        )}

        <div className="relative" data-bottom-more>
          <IconButton
            title="More controls"
            onClick={() => setMoreOpen((prev) => !prev)}
            ariaControls={moreSheetId}
            ariaExpanded={moreOpen}
            ariaHasPopup="dialog"
            buttonRef={moreTriggerRef}
          >
            <FaEllipsisH />
          </IconButton>
          {moreOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 bg-black/50 z-40 transition-opacity backdrop-blur-[2px]"
                onClick={closeMoreControls}
                aria-hidden="true"
              />
              {/* Bottom Sheet */}
              <div
                id={moreSheetId}
                role="dialog"
                aria-modal="true"
                aria-labelledby={moreSheetTitleId}
                data-bottom-more-sheet="true"
                className="fixed bottom-[var(--mobile-tabbar-height,60px)] left-0 right-0 max-h-[70vh] ui-panel border-t rounded-t-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.3)] overflow-y-auto z-50 overscroll-contain pb-safe animate-slide-up select-none touch-manipulation"
              >
                <div className="sticky top-0 bg-[var(--ui-surface)]/95 backdrop-blur-md border-b border-[var(--ui-border)] px-4 py-3 flex items-center justify-between z-10">
                  <div id={moreSheetTitleId} className="text-sm font-semibold">More Controls</div>
                  <button type="button"
                    ref={moreCloseRef}
                    onClick={closeMoreControls}
                    aria-label="Close more controls"
                    title="Close more controls"
                    className="p-2 -mr-2 text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] rounded-full hover:bg-[var(--ui-surface-2)]"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M13 1L1 13M1 1L13 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>

                <div className="p-2 flex flex-col gap-1">
                  <button type="button"
                    className="w-full px-4 py-3.5 text-left hover:bg-[var(--ui-surface-2)] active:bg-[var(--ui-surface-2)] rounded-lg flex items-center gap-3 transition-colors"
                    onClick={() => {
                      navigateStart();
                      setMoreOpen(false);
                    }}
                    disabled={isInsertMode}
                  >
                    <div className="w-8 h-8 rounded-full bg-[var(--ui-surface-2)] flex items-center justify-center text-[var(--ui-text)]">
                      <FaStepBackward size={14} />
                    </div>
                    <div className="flex-1 font-medium">Start of game</div>
                  </button>

                  <button type="button"
                    className="w-full px-4 py-3.5 text-left hover:bg-[var(--ui-surface-2)] active:bg-[var(--ui-surface-2)] rounded-lg flex items-center gap-3 transition-colors"
                    onClick={() => {
                      jumpBack(10);
                      setMoreOpen(false);
                    }}
                    disabled={isInsertMode}
                  >
                    <div className="w-8 h-8 rounded-full bg-[var(--ui-surface-2)] flex items-center justify-center text-[var(--ui-text)]">
                      <FaFastBackward size={14} />
                    </div>
                    <div className="flex-1 font-medium">Back 10 moves</div>
                  </button>

                  <button type="button"
                    className="w-full px-4 py-3.5 text-left hover:bg-[var(--ui-surface-2)] active:bg-[var(--ui-surface-2)] rounded-lg flex items-center gap-3 transition-colors"
                    onClick={() => {
                      jumpForward(10);
                      setMoreOpen(false);
                    }}
                    disabled={isInsertMode}
                  >
                    <div className="w-8 h-8 rounded-full bg-[var(--ui-surface-2)] flex items-center justify-center text-[var(--ui-text)]">
                      <FaFastForward size={14} />
                    </div>
                    <div className="flex-1 font-medium">Forward 10 moves</div>
                  </button>

                  <button type="button"
                    className="w-full px-4 py-3.5 text-left hover:bg-[var(--ui-surface-2)] active:bg-[var(--ui-surface-2)] rounded-lg flex items-center gap-3 transition-colors"
                    onClick={() => {
                      navigateEnd();
                      setMoreOpen(false);
                    }}
                    disabled={isInsertMode}
                  >
                    <div className="w-8 h-8 rounded-full bg-[var(--ui-surface-2)] flex items-center justify-center text-[var(--ui-text)]">
                      <FaStepForward size={14} />
                    </div>
                    <div className="flex-1 font-medium">End of game</div>
                  </button>

                  <div className="h-px bg-[var(--ui-border)] mx-2 my-1" />

                  {showBranchControl && branchInfo && switchBranch && (
                    <>
                      <div className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide ui-text-faint">
                        Variation
                      </div>
                      <button type="button"
                        className="w-full px-4 py-3.5 text-left hover:bg-[var(--ui-surface-2)] active:bg-[var(--ui-surface-2)] rounded-lg flex items-center gap-3 transition-colors"
                        onClick={() => {
                          switchBranch(-1);
                          setMoreOpen(false);
                        }}
                        disabled={isInsertMode}
                      >
                        <div className="w-8 h-8 rounded-full bg-[var(--ui-surface-2)] flex items-center justify-center text-[var(--ui-text)]">
                          <FaChevronUp size={14} />
                        </div>
                        <div className="flex-1 font-medium">Previous branch</div>
                        <div className="text-xs ui-text-faint">{shortcutLabels['branch-prev']}</div>
                      </button>

                      <button type="button"
                        className="w-full px-4 py-3.5 text-left hover:bg-[var(--ui-surface-2)] active:bg-[var(--ui-surface-2)] rounded-lg flex items-center gap-3 transition-colors"
                        onClick={() => {
                          switchBranch(1);
                          setMoreOpen(false);
                        }}
                        disabled={isInsertMode}
                      >
                        <div className="w-8 h-8 rounded-full bg-[var(--ui-surface-2)] flex items-center justify-center text-[var(--ui-text)]">
                          <FaChevronDown size={14} />
                        </div>
                        <div className="flex-1 font-medium">Next branch</div>
                        <div className="text-xs ui-text-faint">{shortcutLabels['branch-next']}</div>
                      </button>

                      <div
                        className="mx-2 px-4 py-3 rounded-lg bg-[var(--ui-surface)] border border-[var(--ui-border)] flex items-center justify-between gap-3"
                        data-bottom-branch-control="true"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold ui-text-faint uppercase tracking-wide">Current branch</div>
                          <div className="text-sm text-[var(--ui-text)]">{branchTitle}</div>
                        </div>
                        <div className="shrink-0 text-sm">{renderBranchIndexButton(false)}</div>
                      </div>

                      <div className="h-px bg-[var(--ui-border)] mx-2 my-1" />
                    </>
                  )}

                  {onUndo && (
                    <button type="button"
                      className="w-full px-4 py-3.5 text-left hover:bg-[var(--ui-surface-2)] active:bg-[var(--ui-surface-2)] rounded-lg flex items-center gap-3 transition-colors"
                      onClick={() => {
                        onUndo();
                        setMoreOpen(false);
                      }}
                    >
                      <div className="w-8 h-8 rounded-full bg-[var(--ui-surface-2)] flex items-center justify-center text-[var(--ui-text)]">
                        <FaUndo size={14} />
                      </div>
                      <div className="flex-1 font-medium">Undo last move</div>
                    </button>
                  )}

                  {onAiMove && (
                    <button type="button"
                      className="w-full px-4 py-3.5 text-left hover:bg-[var(--ui-surface-2)] active:bg-[var(--ui-surface-2)] rounded-lg flex items-center gap-3 transition-colors"
                      onClick={() => {
                        onAiMove();
                        setMoreOpen(false);
                      }}
                    >
                      <div className="w-8 h-8 rounded-full bg-[var(--ui-surface-2)] flex items-center justify-center text-teal-400">
                        <FaRobot size={14} />
                      </div>
                      <div className="flex-1 font-medium text-teal-400">Request AI move</div>
                    </button>
                  )}

                  {onResign && (
                    <button type="button"
                      className="w-full px-4 py-3.5 text-left hover:bg-rose-950/30 active:bg-rose-950/30 rounded-lg flex items-center gap-3 transition-colors text-rose-500"
                      onClick={() => {
                        onResign();
                        setMoreOpen(false);
                      }}
                    >
                      <div className="w-8 h-8 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500">
                        <FaFlag size={14} />
                      </div>
                      <div className="flex-1 font-medium">Resign</div>
                    </button>
                  )}

                  <div className="h-px bg-[var(--ui-border)] mx-2 my-1" />

                  <button type="button"
                    className="w-full px-4 py-3.5 text-left hover:bg-[var(--ui-surface-2)] active:bg-[var(--ui-surface-2)] rounded-lg flex items-center gap-3 transition-colors"
                    onClick={() => {
                      findMistake('undo');
                      setMoreOpen(false);
                    }}
                    disabled={isInsertMode}
                  >
                    <div className="w-8 h-8 rounded-full bg-[var(--ui-surface)] flex items-center justify-center">
                      <span className="inline-flex items-center gap-1" aria-hidden="true">
                        <FaChevronLeft size={9} />
                        <span className="h-2 w-2 rounded-full bg-[var(--eval-mistake)]" />
                      </span>
                    </div>
                    <div className="flex-1 font-medium">Previous mistake</div>
                  </button>

                  <button type="button"
                    className="w-full px-4 py-3.5 text-left hover:bg-[var(--ui-surface-2)] active:bg-[var(--ui-surface-2)] rounded-lg flex items-center gap-3 transition-colors"
                    onClick={() => {
                      findMistake('redo');
                      setMoreOpen(false);
                    }}
                    disabled={isInsertMode}
                  >
                    <div className="w-8 h-8 rounded-full bg-[var(--ui-surface)] flex items-center justify-center">
                      <span className="inline-flex items-center gap-1" aria-hidden="true">
                        <span className="h-2 w-2 rounded-full bg-[var(--eval-mistake)]" />
                        <FaChevronRight size={9} />
                      </span>
                    </div>
                    <div className="flex-1 font-medium">Next mistake</div>
                  </button>

                  <div className="h-px bg-[var(--ui-border)] mx-2 my-1" />

                  <button type="button"
                    className="w-full px-4 py-3.5 text-left hover:bg-[var(--ui-surface-2)] active:bg-[var(--ui-surface-2)] rounded-lg flex items-center gap-3 transition-colors"
                    onClick={() => {
                      rotateBoard();
                      setMoreOpen(false);
                    }}
                  >
                    <div className="w-8 h-8 rounded-full bg-[var(--ui-surface-2)] flex items-center justify-center text-[var(--ui-text)]">
                      <FaSyncAlt size={14} />
                    </div>
                    <div className="flex-1 font-medium">Rotate Board</div>
                  </button>

                  {/* Bottom padding for safe area */}
                  <div className="h-4" />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="ui-bar ui-bar-height ui-bar-pad border-t flex items-center gap-3 select-none">
      <div className="relative">
        {passPolicyColor && (
          <div
            className="absolute inset-y-0 left-1/2 -translate-x-1/2 pointer-events-none rounded-full"
            style={{ height: '100%', aspectRatio: '1 / 1', backgroundColor: passPolicyColor }}
          />
        )}
        <button type="button"
          ref={passBtnRef}
          className="relative px-4 py-2 bg-[var(--ui-surface-2)] hover:brightness-110 rounded-lg text-sm font-medium text-[var(--ui-text)] transition-colors"
          onClick={passTurn}
          aria-label="Pass turn"
          title={withShortcut('Pass', 'pass')}
        >
          Pass
        </button>
        {passPv && (
          <div
            className="absolute pointer-events-none flex items-center justify-center"
            style={{
              left: '100%',
              top: '50%',
              width: passBtnHeight > 0 ? passBtnHeight : 32,
              height: passBtnHeight > 0 ? passBtnHeight : 32,
              transform: 'translate(0, -50%)',
              zIndex: 20,
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url('${publicUrl(`katrain/${passPv.player === 'black' ? 'B_stone.png' : 'W_stone.png'}`)}')`,
                backgroundSize: 'contain',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
              }}
            />
            <div
              className="font-bold"
              style={{
                color: passPv.player === 'black' ? 'white' : 'black',
                fontSize: passBtnHeight > 0 ? passBtnHeight / (2 * STONE_SIZE * 1.45) : 14,
                lineHeight: 1,
              }}
            >
              {passPv.idx}
            </div>
          </div>
        )}
      </div>

      {/* Navigation controls */}
      <div className="flex-1 flex items-center justify-center gap-1">
        <IconButton
          title={withShortcut('Previous mistake', 'prev-mistake')}
          onClick={() => findMistake('undo')}
          disabled={isInsertMode}
        >
          <span className="inline-flex items-center gap-1" aria-hidden="true">
            <FaChevronLeft size={9} />
            <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--eval-mistake)]" />
          </span>
        </IconButton>

        <div className="h-6 w-px bg-[var(--ui-border)] mx-0.5" />

        <IconButton title={withShortcut('Start', 'nav-start')} onClick={navigateStart} disabled={isInsertMode}>
          <FaStepBackward />
        </IconButton>
        <IconButton title={withShortcut('Back 10', 'nav-back-10')} onClick={() => jumpBack(10)} disabled={isInsertMode}>
          <FaFastBackward />
        </IconButton>
        <IconButton title={withShortcut('Back', 'nav-back')} onClick={navigateBack}>
          <FaChevronLeft />
        </IconButton>

        {/* Move counter */}
        <div
          className="px-3 py-1.5 rounded-md bg-[var(--ui-surface)] border border-[var(--ui-border)] text-sm text-[var(--ui-text-muted)] font-mono flex items-center gap-2 min-w-[138px] justify-center"
          title={matchupSummary}
          aria-label={matchupSummary}
        >
          <span className={currentPlayer === 'black' ? activePlayerClass : inactivePlayerClass} title={`Black: ${blackPlayerLabel}, ${blackCaptures} captured`}>B</span>
          <span className="text-[var(--ui-text-faint)]">·</span>
          <span className={currentPlayer === 'white' ? activePlayerClass : inactivePlayerClass} title={`White: ${whitePlayerLabel}, ${whiteCaptures} captured`}>W</span>
          <span className="text-[var(--ui-text-faint)] mx-1">|</span>
          {isMoveNumberEditing ? (
            <span className="inline-flex items-center gap-1">
              <span className="ui-text-faint">Move</span>
              <input
                type="number"
                value={moveNumberDraft}
                onChange={(event) => setMoveNumberDraft(event.target.value)}
                onKeyDown={handleMoveNumberKeyDown}
                onBlur={handleMoveNumberBlur}
                onFocus={(event) => event.currentTarget.select()}
                aria-label="Move number"
                inputMode="numeric"
                min={0}
                max={totalMovesInCurrentLine}
                className="w-7 bg-transparent p-0 text-right font-semibold text-[var(--ui-text)] outline-none"
                autoFocus
              />
              <span className="ui-text-faint">/{totalMovesInCurrentLine}</span>
            </span>
          ) : (
            <button
              type="button"
              className="inline-flex min-h-11 items-center gap-1 rounded px-2 text-left hover:bg-[var(--ui-surface-2)] disabled:cursor-not-allowed disabled:opacity-50"
              title="Set move number"
              onClick={openMoveNumberEditor}
              disabled={isInsertMode}
            >
              <span className="ui-text-faint">Move</span>
              <span className="text-[var(--ui-text)] font-semibold">{currentMoveNumber}</span>
              <span className="ui-text-faint">/{totalMovesInCurrentLine}</span>
            </button>
          )}
        </div>

        {showBranchControl && branchInfo && switchBranch && (
          <div
            className="flex items-center gap-0.5 rounded-md bg-[var(--ui-surface)] border border-[var(--ui-border)] px-1 py-0.5 text-xs text-[var(--ui-text-muted)]"
            data-bottom-branch-control="true"
          >
            <button
              type="button"
              className="ui-control flex items-center justify-center rounded hover:bg-[var(--ui-surface-2)] disabled:cursor-not-allowed disabled:opacity-40"
              title={withShortcut('Previous branch', 'branch-prev')}
              aria-label={withShortcut('Previous branch', 'branch-prev')}
              onClick={() => switchBranch(-1)}
              disabled={isInsertMode}
            >
              <FaChevronUp size={10} />
            </button>
            {renderBranchIndexButton(false)}
            <button
              type="button"
              className="ui-control flex items-center justify-center rounded hover:bg-[var(--ui-surface-2)] disabled:cursor-not-allowed disabled:opacity-40"
              title={withShortcut('Next branch', 'branch-next')}
              aria-label={withShortcut('Next branch', 'branch-next')}
              onClick={() => switchBranch(1)}
              disabled={isInsertMode}
            >
              <FaChevronDown size={10} />
            </button>
          </div>
        )}

        <IconButton title={withShortcut('Forward', 'nav-forward')} onClick={navigateForward} disabled={isInsertMode}>
          <FaChevronRight />
        </IconButton>
        <IconButton title={withShortcut('Forward 10', 'nav-forward-10')} onClick={() => jumpForward(10)} disabled={isInsertMode}>
          <FaFastForward />
        </IconButton>
        <IconButton title={withShortcut('End', 'nav-end')} onClick={navigateEnd} disabled={isInsertMode}>
          <FaStepForward />
        </IconButton>

        <div className="h-6 w-px bg-[var(--ui-border)] mx-0.5" />

        <IconButton
          title={withShortcut('Next mistake', 'next-mistake')}
          onClick={() => findMistake('redo')}
          disabled={isInsertMode}
        >
          <span className="inline-flex items-center gap-1" aria-hidden="true">
            <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--eval-mistake)]" />
            <FaChevronRight size={9} />
          </span>
        </IconButton>
        <IconButton title={withShortcut('Rotate', 'rotate-board')} onClick={rotateBoard}>
          <FaSyncAlt />
        </IconButton>
      </div>

    </div>
  );
};
