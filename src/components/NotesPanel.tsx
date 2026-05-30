import React, { useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';
import type { CandidateMove, FloatArray, Move, Player } from '../types';
import { formatRootInfoText } from '../utils/gameInfoText';

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
          <label className="text-xs font-semibold ui-text-faint">User Note (SGF C)</label>
          <textarea
            value={currentNode.note ?? ''}
            onChange={(e) => setCurrentNodeNote(e.target.value)}
            placeholder="Write a note for this position…"
            className="w-full min-h-[72px] max-h-44 ui-input rounded p-2 border focus:border-[var(--ui-accent)] outline-none text-sm font-mono resize-y"
          />
          <div className="text-[11px] ui-text-faint">Saved to SGF `C` and KaTrain-style comment markers are preserved on export.</div>
        </div>
      )}
    </div>
  );
};
