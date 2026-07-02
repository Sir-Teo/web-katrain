import React, { useMemo } from 'react';
import { FaEdit, FaSave, FaStickyNote, FaTimes, FaMinus, FaPlus } from 'react-icons/fa';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';
import type { CandidateMove, FloatArray, GameNode, Move, Player } from '../types';
import { formatRootInfoText } from '../utils/gameInfoText';
import { parseNoteBlocks, parseNoteInlinePreview, type NoteInlineSegment, type NoteTableAlignment } from '../utils/notePreview';
import { getVisualKeyboardInset, getVisualViewport } from '../utils/visualViewport';
import { getMoveInsight, getMoveInsightCoach } from '../utils/moveInsight';
import { getNoteEditorKeyAction } from '../utils/noteEditorKeys';
import { getNoteEditorSyncDecision } from '../utils/noteEditorState';
import { useShortcutLabels } from '../hooks/useShortcutLabels';
import { appendShapeCoachNoteBlock, formatShapeCoachNoteBlock } from '../utils/shapeCoachNote';
import { getCurrentLineMoveNumber, isGameNodeStep } from '../utils/branchNavigation';

const NOTE_SHORTCUT_IDS = ['edit-note'] as const;

const NOTE_FONT_SCALE_MIN = 0.8;
const NOTE_FONT_SCALE_MAX = 1.5;
const NOTE_FONT_SCALE_STEP = 0.1;
const clampNoteFontScale = (value: number): number => {
  if (!Number.isFinite(value)) return 1;
  return Math.min(NOTE_FONT_SCALE_MAX, Math.max(NOTE_FONT_SCALE_MIN, Math.round(value * 100) / 100));
};

function moveToLabel(move: Move | null, boardSize: number): string {
  if (!move) return 'Root';
  if (move.x < 0 || move.y < 0) return 'Pass';
  const col = String.fromCharCode(65 + (move.x >= 8 ? move.x + 1 : move.x));
  const row = boardSize - move.y;
  return `${col}${row}`;
}

function noMoveNodeLabel(currentNode: GameNode): string {
  if (!currentNode.parent) return 'Root';
  if (isGameNodeStep(currentNode)) return `Setup ${getCurrentLineMoveNumber(currentNode)}`;
  return 'Node';
}

function playerToShort(player: Player): string {
  return player === 'black' ? 'B' : 'W';
}

function bestMoveFromCandidates(moves: CandidateMove[] | undefined): CandidateMove | null {
  if (!moves || moves.length === 0) return null;
  return moves.find((m) => m.order === 0) ?? moves[0] ?? null;
}

type PolicyMove = { prob: number; x: number; y: number; isPass: boolean };
function policyRanking(policy: FloatArray, boardSize: number): PolicyMove[] {
  const out: PolicyMove[] = [];
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      const p = policy[y * boardSize + x] ?? -1;
      if (p > 0) out.push({ prob: p, x, y, isPass: false });
    }
  }
  const pass = policy[boardSize * boardSize] ?? -1;
  if (pass > 0) out.push({ prob: pass, x: -1, y: -1, isPass: true });
  out.sort((a, b) => b.prob - a.prob);
  return out;
}

type NotesPanelProps = {
  showInfo: boolean;
  detailed: boolean;
  showNotes: boolean;
  showShapeCoach?: boolean;
  focusRequest?: number;
};

function NoteInlinePreview({ segments }: { segments: NoteInlineSegment[] }) {
  return (
    <>
      {segments.map((segment, index) => {
        const key = `${segment.type}-${index}`;
        if (segment.type === 'strong') return <strong key={key} className="font-semibold text-[var(--ui-text)]">{segment.text}</strong>;
        if (segment.type === 'code') {
          return (
            <code key={key} className="rounded bg-[var(--ui-surface-2)] px-1 py-0.5 font-mono text-[0.92em] text-[var(--ui-text)]">
              {segment.text}
            </code>
          );
        }
        if (segment.type === 'link') {
          return (
            <a
              key={key}
              href={segment.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="text-[var(--ui-accent)] underline decoration-[var(--ui-accent)]/50 underline-offset-2 hover:decoration-[var(--ui-accent)]"
            >
              {segment.text}
            </a>
          );
        }
        return <React.Fragment key={key}>{segment.text}</React.Fragment>;
      })}
    </>
  );
}

function noteTableAlignClass(alignment: NoteTableAlignment): string {
  if (alignment === 'center') return 'text-center';
  if (alignment === 'right') return 'text-right';
  return 'text-left';
}

function NotePreview({ note }: { note: string }) {
  const blocks = parseNoteBlocks(note);
  return (
    <div className="space-y-1.5">
      {blocks.map((block, index) => {
        if (block.type === 'blank') return <div key={`blank-${index}`} className="h-2" aria-hidden="true" />;
        if (block.type === 'heading') {
          const headingClass =
            block.level === 1
              ? 'text-sm font-semibold text-[var(--ui-text)]'
              : block.level === 2
                ? 'text-[13px] font-semibold text-[var(--ui-text)]'
                : 'text-xs font-semibold uppercase tracking-wide text-[var(--ui-text-muted)]';
          return (
            <div key={`line-${index}`} className={headingClass} data-note-block="heading">
              <NoteInlinePreview segments={parseNoteInlinePreview(block.text)} />
            </div>
          );
        }
        if (block.type === 'quote') {
          return (
            <div
              key={`line-${index}`}
              className="border-l-2 border-[var(--ui-accent)]/70 pl-2 italic text-[var(--ui-text-muted)]"
              data-note-block="quote"
            >
              <NoteInlinePreview segments={parseNoteInlinePreview(block.text)} />
            </div>
          );
        }
        if (block.type === 'code') {
          return (
            <pre
              key={`line-${index}`}
              className="overflow-x-auto rounded border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-2 font-mono text-[11px] leading-5 text-[var(--ui-text)]"
              data-note-block="code"
            >
              <code>{block.text || ' '}</code>
            </pre>
          );
        }
        if (block.type === 'table') {
          return (
            <div
              key={`line-${index}`}
              className="overflow-x-auto rounded border border-[var(--ui-border)] bg-[var(--ui-surface)]"
              data-note-block="table"
            >
              <table className="min-w-full border-collapse text-[11px] leading-5">
                <thead className="bg-[var(--ui-surface-2)] text-[var(--ui-text)]">
                  <tr>
                    {block.headers.map((header, cellIndex) => (
                      <th
                        key={`head-${cellIndex}`}
                        className={[
                          'border-b border-[var(--ui-border)] px-2 py-1 font-semibold',
                          noteTableAlignClass(block.alignments[cellIndex] ?? 'left'),
                        ].join(' ')}
                      >
                        <NoteInlinePreview segments={parseNoteInlinePreview(header)} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`row-${rowIndex}`}>
                      {block.headers.map((_, cellIndex) => (
                        <td
                          key={`cell-${rowIndex}-${cellIndex}`}
                          className={[
                            'border-t border-[var(--ui-border)]/70 px-2 py-1 align-top text-[var(--ui-text-muted)]',
                            noteTableAlignClass(block.alignments[cellIndex] ?? 'left'),
                          ].join(' ')}
                        >
                          <NoteInlinePreview segments={parseNoteInlinePreview(row[cellIndex] ?? '')} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.type === 'task') {
          return (
            <div key={`line-${index}`} className="flex gap-2" data-note-block="task">
              <span
                className={[
                  'mt-[0.22em] grid h-3.5 w-3.5 flex-none place-items-center rounded-sm border text-[9px] font-bold leading-none',
                  block.checked
                    ? 'border-[var(--ui-accent)] bg-[var(--ui-accent)] text-[var(--ui-accent-contrast)]'
                    : 'border-[var(--ui-border)] bg-[var(--ui-surface-2)] text-transparent',
                ].join(' ')}
                aria-hidden="true"
              >
                {block.checked ? 'x' : ''}
              </span>
              <span className={['min-w-0', block.checked ? 'opacity-80 line-through' : ''].join(' ')}>
                <NoteInlinePreview segments={parseNoteInlinePreview(block.text)} />
              </span>
            </div>
          );
        }
        if (block.type === 'ordered') {
          return (
            <div key={`line-${index}`} className="flex gap-2" data-note-block="ordered">
              <span className="w-5 flex-none text-right font-mono text-[var(--ui-text-muted)]">{block.number}.</span>
              <span className="min-w-0">
                <NoteInlinePreview segments={parseNoteInlinePreview(block.text)} />
              </span>
            </div>
          );
        }
        if (block.type === 'bullet') {
          return (
            <div key={`line-${index}`} className="flex gap-2" data-note-block="bullet">
              <span className="mt-[0.45em] h-1.5 w-1.5 flex-none rounded-full bg-[var(--ui-text-muted)]" aria-hidden="true" />
              <span className="min-w-0">
                <NoteInlinePreview segments={parseNoteInlinePreview(block.text)} />
              </span>
            </div>
          );
        }
        return (
          <p key={`line-${index}`} className="min-w-0" data-note-block="paragraph">
            <NoteInlinePreview segments={parseNoteInlinePreview(block.text)} />
          </p>
        );
      })}
    </div>
  );
}

export const NotesPanel: React.FC<NotesPanelProps> = ({ showInfo, detailed, showNotes, showShapeCoach = true, focusRequest = 0 }) => {
  const { rootNode, currentNode, setCurrentNodeNote, treeVersion, gameRules, isAnalysisMode, engineStatus, engineError, noteFontScale, updateSettings } = useGameStore(
    (state) => ({
      rootNode: state.rootNode,
      currentNode: state.currentNode,
      setCurrentNodeNote: state.setCurrentNodeNote,
      treeVersion: state.treeVersion,
      gameRules: state.settings.gameRules,
      isAnalysisMode: state.isAnalysisMode,
      engineStatus: state.engineStatus,
      engineError: state.engineError,
      noteFontScale: state.settings.noteFontScale,
      updateSettings: state.updateSettings,
    }),
    shallow
  );
  const fontScale = clampNoteFontScale(noteFontScale ?? 1);
  const adjustNoteFontScale = (delta: number) => {
    updateSettings({ noteFontScale: clampNoteFontScale(fontScale + delta) });
  };
  void treeVersion;

  const move = currentNode.move;
  const boardSize = currentNode.gameState.board.length;
  const parentBoard = currentNode.parent?.gameState.board ?? null;
  const moveInsight = useMemo(() => getMoveInsight(move, boardSize, parentBoard), [boardSize, move, parentBoard]);
  const moveInsightCoach = useMemo(() => (moveInsight ? getMoveInsightCoach(moveInsight) : null), [moveInsight]);
  const shapeCoachNoteBlock = useMemo(
    () => (moveInsight && moveInsightCoach ? formatShapeCoachNoteBlock(moveInsight, moveInsightCoach) : ''),
    [moveInsight, moveInsightCoach]
  );
  const parent = currentNode.parent;
  const parentPolicy = parent?.analysis?.policy;
  const depth = getCurrentLineMoveNumber(currentNode);
  const label = moveToLabel(move, boardSize);
  const currentNoMoveLabel = noMoveNodeLabel(currentNode);
  const policyStats = useMemo(() => {
    if (!detailed) return null;
    if (!move || !parentPolicy) return null;
    const policy = parentPolicy;
    const rankList = policyRanking(policy, boardSize);
    if (rankList.length === 0) return null;

    const idx = move.x < 0 || move.y < 0 ? boardSize * boardSize : move.y * boardSize + move.x;
    const prob = policy[idx] ?? -1;
    if (!(prob > 0)) return null;

    const rank =
      rankList.findIndex((m) =>
        move.x < 0 || move.y < 0 ? m.isPass : !m.isPass && m.x === move.x && m.y === move.y
      ) + 1;
    const best = rankList[0] ?? null;
    return { rank: rank > 0 ? rank : null, prob, best };
  }, [boardSize, detailed, move, parentPolicy]);

  const topMove = useMemo(() => bestMoveFromCandidates(parent?.analysis?.moves), [parent?.analysis?.moves]);
  const topMoveLabel =
    topMove?.x == null
      ? null
      : topMove.x < 0 || topMove.y < 0
        ? 'Pass'
        : `${String.fromCharCode(65 + (topMove.x >= 8 ? topMove.x + 1 : topMove.x))}${boardSize - topMove.y}`;

  const showInfoBlock = showInfo || detailed;
  const showNotesBlock = showNotes;
  const hasShapeCoach = Boolean(showShapeCoach && moveInsight && moveInsightCoach);
  const shortcutLabels = useShortcutLabels(NOTE_SHORTCUT_IDS);
  const currentNote = currentNode.note ?? '';
  const noteHasContent = currentNote.trim().length > 0;
  const noteActionLabel = noteHasContent ? 'Edit note' : 'Add note';
  const noteShortcutLabel = shortcutLabels['edit-note'];
  const noteActionTitle = noteShortcutLabel === 'Disabled' ? noteActionLabel : `${noteActionLabel} (${noteShortcutLabel})`;
  const [isEditingNote, setIsEditingNote] = React.useState(false);
  const [noteDraft, setNoteDraft] = React.useState(currentNote);
  const noteTextareaRef = React.useRef<HTMLTextAreaElement>(null);
  const shouldFocusNoteRef = React.useRef(false);
  const previousNoteNodeIdRef = React.useRef(currentNode.id);
  const lastFocusRequestRef = React.useRef(0);
  const [keyboardInset, setKeyboardInset] = React.useState(0);

  const scrollNoteEditorIntoView = React.useCallback(() => {
    const editor = noteTextareaRef.current;
    if (!editor) return;
    window.setTimeout(() => {
      try {
        editor.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } catch {
        // Best effort for browsers with partial scrollIntoView support.
      }
    }, 0);
  }, []);

  const focusNoteEditor = React.useCallback(() => {
    const editor = noteTextareaRef.current;
    if (!editor) return false;
    editor.focus();
    const cursor = editor.value.length;
    editor.setSelectionRange(cursor, cursor);
    scrollNoteEditorIntoView();
    return true;
  }, [scrollNoteEditorIntoView]);

  const requestNoteEditorFocus = React.useCallback(() => {
    shouldFocusNoteRef.current = true;
    window.setTimeout(() => {
      if (!shouldFocusNoteRef.current) return;
      if (focusNoteEditor()) shouldFocusNoteRef.current = false;
    }, 0);
  }, [focusNoteEditor]);

  React.useEffect(() => {
    const sync = getNoteEditorSyncDecision({
      previousNodeId: previousNoteNodeIdRef.current,
      currentNodeId: currentNode.id,
      currentNote,
      isEditing: isEditingNote,
    });
    previousNoteNodeIdRef.current = currentNode.id;
    if (!sync) return;
    setNoteDraft(sync.draft);
    setIsEditingNote(sync.editing);
  }, [currentNode.id, currentNote, isEditingNote]);

  React.useEffect(() => {
    if (!isEditingNote || !shouldFocusNoteRef.current) return;
    if (focusNoteEditor()) shouldFocusNoteRef.current = false;
  }, [focusNoteEditor, isEditingNote]);

  React.useEffect(() => {
    if (!isEditingNote) {
      setKeyboardInset(0);
      return;
    }
    const visualViewport = getVisualViewport();
    if (!visualViewport) return;
    const updateForKeyboard = () => {
      const inset = getVisualKeyboardInset();
      setKeyboardInset(inset);
      if (inset > 0) scrollNoteEditorIntoView();
    };
    updateForKeyboard();
    visualViewport.addEventListener('resize', updateForKeyboard);
    visualViewport.addEventListener('scroll', updateForKeyboard);
    return () => {
      visualViewport.removeEventListener('resize', updateForKeyboard);
      visualViewport.removeEventListener('scroll', updateForKeyboard);
    };
  }, [isEditingNote, scrollNoteEditorIntoView]);

  const startNoteEdit = React.useCallback(() => {
    setNoteDraft(currentNote);
    requestNoteEditorFocus();
    setIsEditingNote(true);
  }, [currentNote, requestNoteEditorFocus]);

  React.useEffect(() => {
    if (!showNotesBlock || focusRequest <= 0 || focusRequest === lastFocusRequestRef.current) return;
    lastFocusRequestRef.current = focusRequest;
    startNoteEdit();
  }, [focusRequest, showNotesBlock, startNoteEdit]);

  const saveNote = () => {
    setCurrentNodeNote(noteDraft);
    setIsEditingNote(false);
  };

  const shapeCoachNoteSource = isEditingNote ? noteDraft : currentNote;
  const hasShapeCoachNoteBlock = Boolean(shapeCoachNoteBlock && shapeCoachNoteSource.includes(shapeCoachNoteBlock));

  const addShapeCoachToNote = () => {
    if (!shapeCoachNoteBlock || hasShapeCoachNoteBlock) return;
    if (isEditingNote) {
      setNoteDraft((draft) => appendShapeCoachNoteBlock(draft, shapeCoachNoteBlock));
      requestNoteEditorFocus();
      return;
    }

    setCurrentNodeNote(appendShapeCoachNoteBlock(currentNote, shapeCoachNoteBlock));
    setIsEditingNote(false);
  };

  const cancelNoteEdit = () => {
    setNoteDraft(currentNote);
    setIsEditingNote(false);
  };

  const handleNoteKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation();
    const action = getNoteEditorKeyAction({
      key: event.key,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      isComposing: event.nativeEvent.isComposing,
    });
    if (action === 'cancel') {
      event.preventDefault();
      cancelNoteEdit();
    } else if (action === 'save') {
      event.preventDefault();
      saveNote();
    }
  };

  const analysisStatusText = useMemo(() => {
    if (!isAnalysisMode) return 'Analysis off (Tab to enable)';
    if (engineStatus === 'error') return engineError ? `Engine error: ${engineError}` : 'Engine error';
    if (engineStatus === 'loading') return 'Analyzing move...';
    return 'Analyzing move...';
  }, [engineError, engineStatus, isAnalysisMode]);

  const infoText = (() => {
    if (!showInfoBlock) return '';

    if (!parent) {
      return formatRootInfoText({ rootNode, currentNode, gameRules });
    }

    if (!move) {
      return `${currentNoMoveLabel}\n${playerToShort(currentNode.gameState.currentPlayer)} to play`;
    }

    if (!currentNode.analysis) return analysisStatusText;

    let text = `Move ${depth}: ${playerToShort(move.player)} ${label}\n`;

    if (detailed && topMove && topMoveLabel) {
      const topScore = typeof topMove.scoreLead === 'number' ? `${topMove.scoreLead > 0 ? '+' : ''}${topMove.scoreLead.toFixed(1)}` : '?';
      if (topMoveLabel !== label) text += `Top move: ${topMoveLabel} (${topScore})\n`;
      else text += 'Best move\n';
      if (topMove.pv && topMove.pv.length > 0) text += `PV: ${playerToShort(move.player)} ${topMove.pv.join(' ')}\n`;
    }

    if (detailed && policyStats?.rank) {
      text += `Policy rank: #${policyStats.rank} (${(policyStats.prob * 100).toFixed(2)}%)\n`;
      if (policyStats.rank !== 1 && policyStats.best) {
        text += `Policy best: ${policyStats.best.isPass ? 'Pass' : moveToLabel({ x: policyStats.best.x, y: policyStats.best.y, player: move.player }, boardSize)} (${(policyStats.best.prob * 100).toFixed(2)}%)\n`;
      }
    }

    if (detailed && currentNode.aiThoughts) text += `\nAI thoughts: ${currentNode.aiThoughts}`;

    return text;
  })();

  if (!showInfoBlock && !showNotesBlock) return null;

  return (
    <div className="flex flex-col min-h-0">
      {showInfoBlock && (
        <div
          className={[
            showNotesBlock ? 'max-h-32' : 'max-h-56',
            'p-2 text-xs text-[var(--ui-text-muted)] whitespace-pre-wrap font-mono overflow-y-auto',
          ].join(' ')}
        >
          {infoText || (currentNode.analysis ? '' : analysisStatusText)}
        </div>
      )}

      {showShapeCoach && moveInsight && moveInsightCoach && (
        <div
          className={[
            showInfoBlock ? 'border-t border-[var(--ui-border)]' : '',
            showNotesBlock ? 'border-b border-[var(--ui-border)]' : '',
            'px-2 py-2 text-xs',
          ].join(' ')}
          data-shape-coach={moveInsight.tone}
        >
          <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide ui-text-faint">Shape coach</div>
              <div className="truncate font-semibold text-[var(--ui-text)]">{moveInsight.label}</div>
            </div>
            <span className="shrink-0 rounded border border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] px-1.5 py-0.5 text-[10px] font-semibold capitalize text-[var(--ui-accent)]">
              {moveInsight.tone}
            </span>
          </div>
          <div className="grid gap-1.5">
            <div>
              <span className="font-semibold text-[var(--ui-text)]">Beginner: </span>
              <span className="ui-text-muted">{moveInsightCoach.beginner}</span>
            </div>
            {detailed && (
              <div>
                <span className="font-semibold text-[var(--ui-text)]">Pro: </span>
                <span className="ui-text-muted">{moveInsightCoach.pro}</span>
              </div>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {moveInsightCoach.checks.map((check) => (
              <span key={check} className="rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] px-1.5 py-0.5 text-[10px] ui-text-faint">
                {check}
              </span>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className="panel-action-button"
              onClick={addShapeCoachToNote}
              disabled={hasShapeCoachNoteBlock}
              title={hasShapeCoachNoteBlock ? 'Shape Coach is already in this note' : 'Add Shape Coach to note'}
              aria-label={hasShapeCoachNoteBlock ? `${moveInsight.label} Shape Coach is already in this note` : `Add ${moveInsight.label} Shape Coach to note`}
            >
              <FaStickyNote size={11} aria-hidden="true" />
              <span>{hasShapeCoachNoteBlock ? 'In note' : 'Add to note'}</span>
            </button>
            {detailed && moveInsight.learnMoreUrl ? (
              <a
                href={moveInsight.learnMoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] px-2 py-1 text-[10px] font-semibold text-[var(--ui-accent)] hover:bg-[var(--ui-surface-2)]"
                aria-label={`Learn more about ${moveInsight.label}`}
              >
                Learn more
              </a>
            ) : null}
          </div>
        </div>
      )}

      {showNotesBlock && (
        <div
          className={[
            showInfoBlock && !hasShapeCoach ? 'border-t border-[var(--ui-border)]' : '',
            'p-2 flex flex-col gap-2 min-h-0',
          ].join(' ')}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="text-xs font-semibold ui-text-faint" title="Saved as an SGF comment (C property) with the game">Note</div>
              <div className="flex items-center rounded border border-[var(--ui-border)] bg-[var(--ui-surface)]" role="group" aria-label="Note text size">
                <button
                  type="button"
                  className="grid h-6 w-6 place-items-center text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] disabled:opacity-40"
                  onClick={() => adjustNoteFontScale(-NOTE_FONT_SCALE_STEP)}
                  disabled={fontScale <= NOTE_FONT_SCALE_MIN + 0.001}
                  title="Smaller note text"
                  aria-label="Decrease note text size"
                >
                  <FaMinus size={9} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="grid h-6 w-6 place-items-center text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] disabled:opacity-40"
                  onClick={() => adjustNoteFontScale(NOTE_FONT_SCALE_STEP)}
                  disabled={fontScale >= NOTE_FONT_SCALE_MAX - 0.001}
                  title="Larger note text"
                  aria-label="Increase note text size"
                >
                  <FaPlus size={9} aria-hidden="true" />
                </button>
              </div>
            </div>
            {isEditingNote ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="panel-action-button"
                  onClick={saveNote}
                  title="Save note (Enter, Ctrl+S, Cmd+S)"
                  aria-label="Save note, keyboard shortcut Enter, Control+S, or Command+S"
                  data-note-save="true"
                >
                  <FaSave size={11} aria-hidden="true" />
                  <span>Save</span>
                </button>
                <button
                  type="button"
                  className="panel-action-button"
                  onClick={cancelNoteEdit}
                  title="Cancel note edit (Escape)"
                  aria-label="Cancel note edit, keyboard shortcut Escape"
                  data-note-cancel="true"
                >
                  <FaTimes size={11} aria-hidden="true" />
                  <span>Cancel</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="panel-action-button"
                onClick={startNoteEdit}
                title={noteActionTitle}
                aria-label={
                  noteShortcutLabel === 'Disabled'
                    ? noteActionLabel
                    : `${noteActionLabel}, keyboard shortcut ${noteShortcutLabel}`
                }
                data-note-edit="true"
              >
                <FaEdit size={11} aria-hidden="true" />
                <span>{noteHasContent ? 'Edit' : 'Add'}</span>
                {noteShortcutLabel !== 'Disabled' && (
                  <kbd className="font-mono text-[10px] ui-text-faint">{noteShortcutLabel}</kbd>
                )}
              </button>
            )}
          </div>
          {isEditingNote ? (
            <textarea
              ref={noteTextareaRef}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onKeyDown={handleNoteKeyDown}
              onFocus={scrollNoteEditorIntoView}
              aria-label="User note"
              aria-keyshortcuts="Enter Control+S Meta+S Escape"
              data-note-editor="true"
              data-note-keyboard-aware="true"
              placeholder="Write a note for this position..."
              className="w-full min-h-[88px] max-h-44 ui-input rounded p-2 border focus:border-[var(--ui-accent)] outline-none text-sm font-mono resize-y"
              style={{
                fontSize: `${fontScale * 0.875}rem`,
                scrollMarginBlockEnd: `calc(${keyboardInset}px + var(--mobile-tabbar-height, 0px) + var(--mobile-bottom-controls-height, 0px) + var(--pwa-banner-height, 0px) + 24px)`,
              }}
            />
          ) : (
            <div
              className="min-h-[88px] max-h-44 cursor-text overflow-y-auto rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] p-2 text-sm leading-6 text-[var(--ui-text-muted)]"
              data-note-preview="true"
              style={{ fontSize: `${fontScale * 0.875}rem` }}
              onClick={startNoteEdit}
            >
              {noteHasContent ? (
                <NotePreview note={currentNote} />
              ) : (
                <div className="flex h-full min-h-[4.5rem] items-center justify-center text-xs ui-text-faint">
                  No note yet
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
