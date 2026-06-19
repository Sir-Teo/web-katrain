import { getKataGoEngineClient } from '../engine/katago/client';
import type { GameNode, GameSettings } from '../types';

/**
 * Resolve a configured model URL to an absolute URL the worker can fetch.
 * Mirrors the resolution used by the main analysis flow in the store.
 */
export const resolveModelUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^(blob:|data:|https?:|file:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return trimmed;
  if (typeof window === 'undefined') return trimmed;
  if (trimmed.startsWith('/')) return new URL(trimmed, window.location.origin).toString();
  return new URL(trimmed, window.location.href).toString();
};

export interface PositionEval {
  /** Score lead from Black's perspective (positive = Black ahead). */
  blackScoreLead: number;
  /** Win probability for Black (0..1). */
  blackWinRate: number;
}

/**
 * Run a single neural-network evaluation (no MCTS) for a node's position.
 * Fast enough for interactive study tools like the score quiz and lessons.
 * The worker self-loads the model if needed, so this works even before any
 * full analysis has run.
 */
export async function evaluateNode(node: GameNode, settings: GameSettings): Promise<PositionEval> {
  const modelUrl = resolveModelUrl(settings.katagoModelUrl);
  const res = await getKataGoEngineClient().evaluate({
    modelUrl,
    backend: settings.katagoBackend,
    board: node.gameState.board,
    previousBoard: node.parent?.gameState.board,
    previousPreviousBoard: node.parent?.parent?.gameState.board,
    currentPlayer: node.gameState.currentPlayer,
    moveHistory: node.gameState.moveHistory,
    komi: node.gameState.komi,
    rules: settings.gameRules,
    conservativePass: settings.katagoConservativePass,
  });
  return { blackScoreLead: res.rootScoreLead, blackWinRate: res.rootWinRate };
}
