import { describe, expect, it } from 'vitest';
import {
  clampSetupPositionAdvantage,
  clampSetupPositionMove,
  setupPositionProgressLabel,
  setupPositionSummary,
} from '../src/utils/setupPosition';

describe('setup position helpers', () => {
  it('keeps the move number inside a playable range', () => {
    expect(clampSetupPositionMove(100)).toBe(100);
    expect(clampSetupPositionMove(0)).toBe(2);
    expect(clampSetupPositionMove(9999)).toBe(400);
    expect(clampSetupPositionMove(80.6)).toBe(81);
    expect(clampSetupPositionMove(Number.NaN)).toBe(2);
  });

  it('keeps the target score inside a sane range', () => {
    expect(clampSetupPositionAdvantage(20)).toBe(20);
    expect(clampSetupPositionAdvantage(-250)).toBe(-100);
    expect(clampSetupPositionAdvantage(250)).toBe(100);
    expect(clampSetupPositionAdvantage(Number.NaN)).toBe(0);
  });

  it('describes the position in plain language', () => {
    expect(setupPositionSummary({ untilMove: 100, targetAdvantage: 20 })).toBe(
      'Black ahead by about 20 points at move 100.'
    );
    expect(setupPositionSummary({ untilMove: 60, targetAdvantage: -7.5 })).toBe(
      'White ahead by about 7.5 points at move 60.'
    );
    expect(setupPositionSummary({ untilMove: 40, targetAdvantage: 0 })).toBe('An even position at move 40.');
  });

  it('shows progress with a way out', () => {
    expect(setupPositionProgressLabel({ move: 42, untilMove: 100 })).toBe(
      'Generating position… move 42/100 (Esc to stop)'
    );
  });
});
