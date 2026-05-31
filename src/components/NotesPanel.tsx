import React, { useMemo } from 'react';
import { FaEdit, FaSave, FaTimes } from 'react-icons/fa';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';
import type { CandidateMove, FloatArray, Move, Player } from '../types';
import { formatRootInfoText } from '../utils/gameInfoText';
import { parseNoteBlocks, parseNoteInlinePreview, type NoteInlineSegment } from '../utils/notePreview';

function moveToLabel(move: Move | null, boardSize: number): string {
  if (!move) return 'Root';
  if (move.x < 0 || move.y < 0) return 'Pass';
  const col = String.fromCharCode(65 + (move.x >= 8 ? move.x + 1 : move.x));
  const row = boardSize - move.y;
  return `${col}${row}`;
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
              rel="noreferrer"
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

export const NotesPanel: React.FC<NotesPanelProps> = ({ showInfo, detailed, showNotes }) => {
  const { rootNode, currentNode, setCurrentNodeNote, treeVersion, gameRules, isAnalysisMode, engineStatus, engineError } = useGameStore(
    (state) => ({
      rootNode: state.rootNode,
      currentNode: state.currentNode,
      setCurrentNodeNote: state.setCurrentNodeNote,
      treeVersion: state.treeVersion,
      gameRules: state.settings.gameRules,
      isAnalysisMode: state.isAnalysisMode,
      engineStatus: state.engineStatus,
      engineError: state.engineError,
    }),
    shallow
  );
  void treeVersion;

  const move = currentNode.move;
  const boardSize = currentNode.gameState.board.length;
  const parent = currentNode.parent;
  const parentPolicy = parent?.analysis?.policy;
  const depth = currentNode.gameState.moveHistory.length;
  const label = moveToLabel(move, boardSize);
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
  const currentNote = currentNode.note ?? '';
  const noteHasContent = currentNote.trim().length > 0;
  const [isEditingNote, setIsEditingNote] = React.useState(() => !noteHasContent);
  const [noteDraft, setNoteDraft] = React.useState(currentNote);
  const noteTextareaRef = React.useRef<HTMLTextAreaElement>(null);
  const shouldFocusNoteRef = React.useRef(false);

  React.useEffect(() => {
    setNoteDraft(currentNote);
    setIsEditingNote(!currentNote.trim());
  }, [currentNode.id, currentNote]);

  React.useEffect(() => {
    if (!isEditingNote || !shouldFocusNoteRef.current) return;
    shouldFocusNoteRef.current = false;
    noteTextareaRef.current?.focus();
  }, [isEditingNote]);

  const startNoteEdit = () => {
    setNoteDraft(currentNote);
    shouldFocusNoteRef.current = true;
    setIsEditingNote(true);
  };

  const saveNote = () => {
    setCurrentNodeNote(noteDraft);
    setIsEditingNote(false);
  };

  const cancelNoteEdit = () => {
    setNoteDraft(currentNote);
    setIsEditingNote(false);
  };

  const handleNoteKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelNoteEdit();
    } else if ((event.metaKey || event.ctrlKey) && (event.key === 'Enter' || event.key.toLowerCase() === 's')) {
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

    if (!move || !parent) {
      return formatRootInfoText({ rootNode, currentNode, gameRules });
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

      {showNotesBlock && (
        <div
          className={[
            showInfoBlock ? 'border-t border-[var(--ui-border)]' : '',
            'p-2 flex flex-col gap-2 min-h-0',
          ].join(' ')}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold ui-text-faint">Note</div>
              <div className="text-[10px] font-mono ui-text-faint">SGF C</div>
            </div>
            {isEditingNote ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="panel-action-button"
                  onClick={saveNote}
                  title="Save note"
                >
                  <FaSave size={11} aria-hidden="true" />
                  <span>Save</span>
                </button>
                <button
                  type="button"
                  className="panel-action-button"
                  onClick={cancelNoteEdit}
                  title="Cancel note edit"
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
                title={noteHasContent ? 'Edit note' : 'Add note'}
              >
                <FaEdit size={11} aria-hidden="true" />
                <span>{noteHasContent ? 'Edit' : 'Add'}</span>
              </button>
            )}
          </div>
          {isEditingNote ? (
            <textarea
              ref={noteTextareaRef}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onKeyDown={handleNoteKeyDown}
              aria-label="User note"
              data-note-editor="true"
              placeholder="Write a note for this position..."
              className="w-full min-h-[88px] max-h-44 ui-input rounded p-2 border focus:border-[var(--ui-accent)] outline-none text-sm font-mono resize-y"
            />
          ) : (
            <div
              className="min-h-[88px] max-h-44 overflow-y-auto rounded border border-[var(--ui-border)] bg-[var(--ui-surface)] p-2 text-sm leading-6 text-[var(--ui-text-muted)]"
              data-note-preview="true"
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
