import React, { useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';
import { BOARD_SIZE, type CandidateMove, type FloatArray, type Move, type Player } from '../types';

function moveToLabel(move: Move | null): string {
  if (!move) return 'Root';
  if (move.x < 0 || move.y < 0) return 'Pass';
  const col = String.fromCharCode(65 + (move.x >= 8 ? move.x + 1 : move.x));
  const row = BOARD_SIZE - move.y;
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
function policyRanking(policy: FloatArray): PolicyMove[] {
  const out: PolicyMove[] = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const p = policy[y * BOARD_SIZE + x] ?? -1;
      if (p > 0) out.push({ prob: p, x, y, isPass: false });
    }
  }
  const pass = policy[BOARD_SIZE * BOARD_SIZE] ?? -1;
  if (pass > 0) out.push({ prob: pass, x: -1, y: -1, isPass: true });
  out.sort((a, b) => b.prob - a.prob);
  return out;
}

type NotesPanelProps = {
  showInfo: boolean;
  detailed: boolean;
  showNotes: boolean;
};

export const NotesPanel: React.FC<NotesPanelProps> = ({ showInfo, detailed, showNotes }) => {
  const { currentNode, setCurrentNodeNote, treeVersion, isAnalysisMode, engineStatus, engineError } = useGameStore(
    (state) => ({
      currentNode: state.currentNode,
      setCurrentNodeNote: state.setCurrentNodeNote,
      treeVersion: state.treeVersion,
      isAnalysisMode: state.isAnalysisMode,
      engineStatus: state.engineStatus,
      engineError: state.engineError,
    }),
    shallow
  );
  void treeVersion;

  const move = currentNode.move;
  const parent = currentNode.parent;
  const parentPolicy = parent?.analysis?.policy;
  const depth = currentNode.gameState.moveHistory.length;
  const label = moveToLabel(move);
  const policyStats = useMemo(() => {
    if (!detailed) return null;
    if (!move || !parentPolicy) return null;
    const policy = parentPolicy;
    const rankList = policyRanking(policy);
    if (rankList.length === 0) return null;

    const idx = move.x < 0 || move.y < 0 ? BOARD_SIZE * BOARD_SIZE : move.y * BOARD_SIZE + move.x;
    const prob = policy[idx] ?? -1;
    if (!(prob > 0)) return null;

    const rank =
      rankList.findIndex((m) =>
        move.x < 0 || move.y < 0 ? m.isPass : !m.isPass && m.x === move.x && m.y === move.y
      ) + 1;
    const best = rankList[0] ?? null;
    return { rank: rank > 0 ? rank : null, prob, best };
  }, [detailed, move, parentPolicy]);

  const topMove = useMemo(() => bestMoveFromCandidates(parent?.analysis?.moves), [parent?.analysis?.moves]);
  const topMoveLabel =
    topMove?.x == null
      ? null
      : topMove.x < 0 || topMove.y < 0
        ? 'Pass'
        : `${String.fromCharCode(65 + (topMove.x >= 8 ? topMove.x + 1 : topMove.x))}${BOARD_SIZE - topMove.y}`;

  const showInfoBlock = showInfo || detailed;
  const showNotesBlock = showNotes;

  const analysisStatusText = useMemo(() => {
    if (!isAnalysisMode) return 'Analysis off (Tab to enable)';
    if (engineStatus === 'error') return engineError ? `Engine error: ${engineError}` : 'Engine error';
    if (engineStatus === 'loading') return 'Analyzing move...';
    return 'Analyzing move...';
  }, [engineError, engineStatus, isAnalysisMode]);

  const infoText = useMemo(() => {
    if (!showInfoBlock) return '';

    if (!move || !parent) {
      const rulesRaw = currentNode.properties?.RU?.[0];
      const rules = typeof rulesRaw === 'string' && rulesRaw.trim() ? rulesRaw.trim() : 'Japanese';
      return `Komi: ${currentNode.gameState.komi.toFixed(1)}\nRuleset: ${rules}\n`;
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
        text += `Policy best: ${policyStats.best.isPass ? 'Pass' : moveToLabel({ x: policyStats.best.x, y: policyStats.best.y, player: move.player })} (${(policyStats.best.prob * 100).toFixed(2)}%)\n`;
      }
    }

    if (detailed && currentNode.aiThoughts) text += `\nAI thoughts: ${currentNode.aiThoughts}`;

    return text;
  }, [
    analysisStatusText,
    currentNode.aiThoughts,
    currentNode.analysis,
    currentNode.gameState.komi,
    currentNode.properties,
    depth,
    detailed,
    label,
    move,
    parent,
    policyStats,
    showInfoBlock,
    topMove,
    topMoveLabel,
  ]);

  if (!showInfoBlock && !showNotesBlock) return null;

  return (
    <div className="flex flex-col h-full">
      {showInfoBlock && (
        <div
          className={[
            showInfoBlock && showNotesBlock ? 'flex-[1]' : 'flex-1',
            'p-3 text-xs text-[var(--ui-text-muted)] whitespace-pre-wrap font-mono overflow-y-auto',
          ].join(' ')}
        >
          {infoText || (currentNode.analysis ? '' : analysisStatusText)}
        </div>
      )}

      {showNotesBlock && (
        <div
          className={[
            showInfoBlock && showNotesBlock ? 'flex-[2]' : 'flex-1',
            showInfoBlock ? 'border-t border-[var(--ui-border)]' : '',
            'p-3 flex flex-col gap-2 min-h-0',
          ].join(' ')}
        >
          <label className="text-xs font-semibold ui-text-faint">User Note (SGF C)</label>
          <textarea
            value={currentNode.note ?? ''}
            onChange={(e) => setCurrentNodeNote(e.target.value)}
            placeholder="Write a note for this position…"
            className="w-full flex-1 min-h-0 ui-input rounded p-3 border focus:border-[var(--ui-accent)] outline-none text-sm font-mono resize-none"
          />
          <div className="text-[11px] ui-text-faint">Saved to SGF `C` and KaTrain-style comment markers are preserved on export.</div>
        </div>
      )}
    </div>
  );
};
