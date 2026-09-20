import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { useTournamentStore } from '../store/tournamentStore';
import { readRunResult } from '../utils/tournament';
import type { GameResult } from '../utils/tournament';
import type { Player } from '../types';

/**
 * While a ladder or gauntlet game is awaiting its result, watch the live game's
 * SGF result (RE) and auto-record a win/loss when the game ends by resignation.
 * Manual reporting in the Tournament panel covers games that end by counting.
 *
 * Which tree the result may come from is `readRunResult`'s decision; see the
 * note there for why "any tree with an RE" was the wrong answer.
 */
function useRunResultWatcher(args: {
  awaitingResult: boolean;
  userColor: Player | null;
  record: (result: GameResult) => void;
}): void {
  const { awaitingResult, userColor, record } = args;
  const rootNode = useGameStore((s) => s.rootNode);
  const treeVersion = useGameStore((s) => s.treeVersion);
  const watchedRootIdRef = useRef<string | null>(null);

  useEffect(() => {
    const reading = readRunResult({
      awaitingResult: awaitingResult && userColor !== null,
      rootId: rootNode.id,
      result: rootNode.properties?.RE?.[0] ?? null,
      watchedRootId: watchedRootIdRef.current,
    });
    watchedRootIdRef.current = reading.watchedRootId;
    if (!reading.winner || !userColor) return;
    record(reading.winner === userColor ? 'win' : 'loss');
  }, [awaitingResult, userColor, record, rootNode, treeVersion]);
}

export function useTournamentWatcher(): void {
  const ladder = useTournamentStore((s) => s.ladder);
  const recordResult = useTournamentStore((s) => s.recordResult);
  const gauntlet = useTournamentStore((s) => s.gauntlet);
  const recordGauntletResult = useTournamentStore((s) => s.recordGauntletResult);

  useRunResultWatcher({
    awaitingResult: ladder?.awaitingResult === true,
    userColor: ladder?.userColor ?? null,
    record: recordResult,
  });
  useRunResultWatcher({
    awaitingResult: gauntlet?.awaitingResult === true,
    userColor: gauntlet?.userColor ?? null,
    record: recordGauntletResult,
  });
}
