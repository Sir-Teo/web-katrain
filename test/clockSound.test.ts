import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clockSoundCue, type KaTrainTimerDisplay } from '../src/utils/katrainTimer';
import { playClockSound } from '../src/utils/sound';

const byo = (timeSeconds: number, periodsRemaining = 3): KaTrainTimerDisplay => ({
  timeSeconds,
  periodsRemaining,
  timeout: false,
  isAiTurn: false,
});
const main = (timeSeconds: number): KaTrainTimerDisplay => ({ ...byo(timeSeconds), periodsRemaining: null });

describe('clockSoundCue', () => {
  it('ticks once for each of the last five shown seconds', () => {
    expect(clockSoundCue(byo(6.0), byo(5.0))).toBe('countdown');
    expect(clockSoundCue(byo(5.0), byo(4.0))).toBe('countdown');
    expect(clockSoundCue(byo(1.5), byo(0.5))).toBe('countdown');
    expect(clockSoundCue(main(3.2), main(2.0))).toBe('countdown');
  });

  it('stays quiet before the countdown, and within a shown second', () => {
    expect(clockSoundCue(byo(8.0), byo(7.0))).toBeNull();
    expect(clockSoundCue(byo(4.9), byo(4.2))).toBeNull();
    // No step at all: a state change that re-stepped the same moment.
    expect(clockSoundCue(byo(3.0), byo(3.0))).toBeNull();
  });

  it('marks a used-up period and the end of time', () => {
    expect(clockSoundCue(byo(0.3, 3), byo(29.8, 2))).toBe('period');
    expect(clockSoundCue(byo(0.3, 1), { ...byo(0, 0), timeout: true })).toBe('timeout');
    // Once, not on every later step.
    expect(clockSoundCue({ ...byo(0, 0), timeout: true }, { ...byo(0, 0), timeout: true })).toBeNull();
  });

  it('does not beep when main time hands over to byo-yomi', () => {
    expect(clockSoundCue(main(0.4), byo(29.6, 5))).toBeNull();
  });
});

describe('playClockSound', () => {
  it('fails silently where there is no audio', () => {
    expect(() => playClockSound('countdown')).not.toThrow();
    expect(() => playClockSound('timeout')).not.toThrow();
  });
});

describe('Timer Sound setting', () => {
  it('is what the clock checks before it beeps', () => {
    const timer = readFileSync('src/components/Timer.tsx', 'utf8');
    expect(timer).toMatch(/if \(runningFor === runningKey && s\.settings\.timerSound\) \{\s*const cue = clockSoundCue\(previous, display\);\s*if \(cue\) playClockSound\(cue\);/);
  });
});
