import { describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import { generateSgfFromTree, parseSgf } from '../src/utils/sgf';
import { readRecordedResult, toSgfResult } from '../src/utils/manualScore';

describe('a counted draw', () => {
  it('is saved as RE[0], the SGF spelling of a draw', () => {
    const store = useGameStore.getState();
    store.resetGame();
    store.loadGame(parseSgf('(;GM[1]FF[4]SZ[9]KM[0];B[ee];W[];B[])'));
    store.navigateEnd();

    expect(useGameStore.getState().recordCountedResult('Jigo')).toBe(true);
    expect(useGameStore.getState().rootNode.properties?.RE).toEqual(['0']);
    expect(generateSgfFromTree(useGameStore.getState().rootNode)).toContain('RE[0]');
  });

  it('leaves a win as it is', () => {
    expect(toSgfResult('B+3.5')).toBe('B+3.5');
    expect(toSgfResult('jigo')).toBe('0');
  });

  it('reads as a recorded result, however the file spells it', () => {
    expect(readRecordedResult('0')).toBe('Jigo');
    expect(readRecordedResult('Draw')).toBe('Jigo');
    expect(readRecordedResult('Jigo')).toBe('Jigo');
    expect(readRecordedResult('W+R')).toBe('W+R');
    expect(readRecordedResult('?')).toBeNull();
    expect(readRecordedResult('')).toBeNull();
    expect(readRecordedResult(undefined)).toBeNull();
  });
});
