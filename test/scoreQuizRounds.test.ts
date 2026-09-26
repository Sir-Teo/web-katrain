import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('score quiz rounds', () => {
  it('counts a position once, however often it is guessed again', () => {
    // "Guess again" reveals the same position after its answer was shown, and
    // each reveal used to add a round, a leader hit and an error sample.
    const source = readFileSync('src/components/ScoreQuizModal.tsx', 'utf8');
    expect(source).toContain('const scoredNodeIds = useRef(new Set<string>());');
    expect(source).toMatch(/if \(!scoredNodeIds\.current\.has\(nodeId\)\) \{\s*scoredNodeIds\.current\.add\(nodeId\);\s*setStats/);
  });
});
