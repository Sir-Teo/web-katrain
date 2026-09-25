import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('answering a drill or punish quiz on the board', () => {
  it('goes through the same check for a click, a tap and Enter', () => {
    // Held in the click handler alone, a tap on a phone -- whose touchend
    // cancels the click -- played the guess as a move while the drill kept
    // asking.
    const source = readFileSync('src/components/GoBoard.tsx', 'utf8');
    expect(source).toContain('const answerQuizAt = (pt: { x: number; y: number }): boolean => {');
    expect(source.match(/answerQuizAt\(pt\)/g)?.length).toBe(3);
  });
});
