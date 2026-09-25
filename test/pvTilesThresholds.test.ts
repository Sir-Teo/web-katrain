import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('candidate PV tiles', () => {
  it('colour a loss by the player’s thresholds, like the board and list', () => {
    const source = readFileSync('src/components/CandidatePvTiles.tsx', 'utf8');
    expect(source).toContain('evalThresholds: state.settings.trainerEvalThresholds');
    expect(source).not.toContain('getEvaluationClass(move.pointsLost, undefined');
  });
});
