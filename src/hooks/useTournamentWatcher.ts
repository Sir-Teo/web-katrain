import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { useTournamentStore } from '../store/tournamentStore';
import { getPinGameId } from '../utils/pinnedVariations';
import { outcomeForPlayer, readRunResult } from '../utils/tournament';
import type { GameResult, RunGameRef } from '../utils/tournament';
import type { Player } from '../types';

/**
 * While a ladder or gauntlet game is awaiting its result, watch the live game's
 * SGF result (RE) and auto-record a win, loss or draw once the game records one.
 * Manual reporting in the Tournament panel covers games that end by counting.
 *
 * Only the game the run started counts: the run persists that game's id and
 * `readRunResult` ignores any other tree. See the note there.
 */
function useRunResultWatcher(args: {
  awaitingResult: boolean;
  userColor: Player | null;
  runId: string | null;
  gameId: string | null;
  record: (result: GameResult, from?: RunGameRef) => void;
}): void {
  const { awaitingResult, userColor, runId, gameId, record } = args;
  const rootNode = useGameStore((s) => s.rootNode);
  const treeVersion = useGameStore((s) => s.treeVersion);

  useEffect(() => {
    if (!userColor || !runId) return;
    const outcome = readRunResult({
      awaitingResult,
      watchedGameId: gameId,
      gameId: getPinGameId(rootNode),
      result: rootNode.properties?.RE?.[0] ?? null,
    });
    if (!outcome) return;
    // Recording clears the run's game, so a result cannot be counted twice.
    record(outcomeForPlayer(outcome, userColor), { runId, gameId });
  }, [awaitingResult, userColor, runId, gameId, record, rootNode, treeVersion]);
}

export function useTournamentWatcher(): void {
  const ladder = useTournamentStore((s) => s.ladder);
  const recordResult = useTournamentStore((s) => s.recordResult);
  const gauntlet = useTournamentStore((s) => s.gauntlet);
  const recordGauntletResult = useTournamentStore((s) => s.recordGauntletResult);

  useRunResultWatcher({
    awaitingResult: ladder?.awaitingResult === true,
    userColor: ladder?.userColor ?? null,
    runId: ladder?.runId ?? null,
    gameId: ladder?.gameId ?? null,
    record: recordResult,
  });
  useRunResultWatcher({
    awaitingResult: gauntlet?.awaitingResult === true,
    userColor: gauntlet?.userColor ?? null,
    runId: gauntlet?.runId ?? null,
    gameId: gauntlet?.gameId ?? null,
    record: recordGauntletResult,
  });
}
