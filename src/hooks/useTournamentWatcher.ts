import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { useTournamentStore } from '../store/tournamentStore';
import { parseResultWinner } from '../utils/tournament';

/**
 * While a ladder game is awaiting its result, watch the live game's SGF result
 * (RE) and auto-record a win/loss when the game ends by resignation. Manual
 * reporting in the Tournament panel covers games that end by counting.
 */
export function useTournamentWatcher(): void {
  const rootNode = useGameStore((s) => s.rootNode);
  const treeVersion = useGameStore((s) => s.treeVersion);
  const ladder = useTournamentStore((s) => s.ladder);
  const recordResult = useTournamentStore((s) => s.recordResult);
  const gauntlet = useTournamentStore((s) => s.gauntlet);
  const recordGauntletResult = useTournamentStore((s) => s.recordGauntletResult);
  const handledRef = useRef<string | null>(null);
  const gauntletHandledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ladder || !ladder.awaitingResult) {
      handledRef.current = null;
      return;
    }
    const re = rootNode.properties?.RE?.[0] ?? null;
    if (!re || re === handledRef.current) return;
    const winner = parseResultWinner(re);
    if (!winner) return;
    handledRef.current = re;
    recordResult(winner === ladder.userColor ? 'win' : 'loss');
  }, [rootNode, treeVersion, ladder, recordResult]);

  useEffect(() => {
    if (!gauntlet || !gauntlet.awaitingResult) {
      gauntletHandledRef.current = null;
      return;
    }
    const re = rootNode.properties?.RE?.[0] ?? null;
    if (!re || re === gauntletHandledRef.current) return;
    const winner = parseResultWinner(re);
    if (!winner) return;
    gauntletHandledRef.current = re;
    recordGauntletResult(winner === gauntlet.userColor ? 'win' : 'loss');
  }, [rootNode, treeVersion, gauntlet, recordGauntletResult]);
}
