import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  playCaptureSound,
  playNewGameSound,
  playPassSound,
  playStoneSound,
  resetAudioContextForTests,
  resetSoundFailureReport,
  setSoundInitErrorHandler,
} from '../src/utils/sound';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

function restoreWindow() {
  if (originalWindow) {
    Object.defineProperty(globalThis, 'window', originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, 'window');
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  resetAudioContextForTests();
  restoreWindow();
});

describe('sound helpers', () => {
  it('does nothing outside a browser window', () => {
    Reflect.deleteProperty(globalThis, 'window');

    expect(() => playStoneSound()).not.toThrow();
    expect(() => playCaptureSound(2)).not.toThrow();
    expect(() => playPassSound()).not.toThrow();
    expect(() => playNewGameSound()).not.toThrow();
  });

  it('swallows blocked AudioContext construction', () => {
    class BlockedAudioContext {
      constructor() {
        throw new Error('audio blocked');
      }
    }
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { AudioContext: BlockedAudioContext },
    });

    expect(() => playStoneSound()).not.toThrow();
  });

  it('reports blocked AudioContext construction once', () => {
    const handler = vi.fn();
    setSoundInitErrorHandler(handler);

    class BlockedAudioContext {
      constructor() {
        throw new Error('audio blocked');
      }
    }
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { AudioContext: BlockedAudioContext },
    });

    expect(() => playStoneSound()).not.toThrow();
    expect(() => playPassSound()).not.toThrow();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      backend: 'web-audio',
      message: 'Could not initialize browser audio: audio blocked',
      platform: expect.any(String),
    }));
  });

  it('can report again after sound is re-enabled for a retry', () => {
    const handler = vi.fn();
    setSoundInitErrorHandler(handler);

    class BlockedAudioContext {
      constructor() {
        throw new Error('audio blocked');
      }
    }
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { AudioContext: BlockedAudioContext },
    });

    playStoneSound();
    playPassSound();
    resetSoundFailureReport();
    playNewGameSound();

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('swallows blocked AudioContext accessor reads', () => {
    const blockedWindow = {};
    Object.defineProperty(blockedWindow, 'AudioContext', {
      configurable: true,
      get() {
        throw new Error('audio accessor blocked');
      },
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: blockedWindow,
    });

    expect(() => playStoneSound()).not.toThrow();
  });

  it('swallows blocked AudioContext state reads', () => {
    class BlockedStateAudioContext {
      currentTime = 0;
      destination = {};
      get state() {
        throw new Error('audio state blocked');
      }
      resume = () => Promise.resolve();
      createOscillator = () => ({
        connect: () => {},
        type: 'sine',
        frequency: {
          setValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        },
        start: () => {},
        stop: () => {},
      });
      createGain = () => ({
        connect: () => {},
        gain: {
          setValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        },
      });
    }
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { AudioContext: BlockedStateAudioContext },
    });

    expect(() => playStoneSound()).not.toThrow();
  });

  it('waits for a suspended AudioContext to resume before playing', async () => {
    let resumeContext: (() => void) | null = null;
    const start = vi.fn();

    class SuspendedAudioContext {
      currentTime = 0;
      destination = {};
      state: AudioContextState = 'suspended';
      resume = vi.fn(() => new Promise<void>((resolve) => {
        resumeContext = () => {
          this.state = 'running';
          resolve();
        };
      }));
      createOscillator = () => ({
        connect: () => {},
        type: 'sine',
        frequency: {
          setValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        },
        start,
        stop: () => {},
      });
      createGain = () => ({
        connect: () => {},
        gain: {
          setValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        },
      });
    }
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { AudioContext: SuspendedAudioContext },
    });

    playStoneSound();

    expect(start).not.toHaveBeenCalled();
    const resume = resumeContext as (() => void) | null;
    expect(resume).not.toBeNull();
    resume!();
    await Promise.resolve();
    await Promise.resolve();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('debounces rapid repeats of the same sound effect', () => {
    const start = vi.fn();
    vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(120).mockReturnValueOnce(160);

    class RunningAudioContext {
      currentTime = 0;
      destination = {};
      state: AudioContextState = 'running';
      resume = () => Promise.resolve();
      createOscillator = () => ({
        connect: () => {},
        type: 'sine',
        frequency: {
          setValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        },
        start,
        stop: () => {},
      });
      createGain = () => ({
        connect: () => {},
        gain: {
          setValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        },
      });
    }
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { AudioContext: RunningAudioContext },
    });

    playStoneSound();
    playStoneSound();
    playStoneSound();

    expect(start).toHaveBeenCalledTimes(2);
  });

  it('swallows oscillator setup failures after context creation', () => {
    const handler = vi.fn();
    setSoundInitErrorHandler(handler);

    class BrokenAudioContext {
      currentTime = 0;
      destination = {};
      state = 'running';
      resume = () => Promise.resolve();
      createOscillator = () => {
        throw new Error('oscillator blocked');
      };
      createGain = () => ({
        connect: () => {},
        gain: {
          setValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        },
      });
    }
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { AudioContext: BrokenAudioContext },
    });

    expect(() => playPassSound()).not.toThrow();
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      backend: 'web-audio',
      message: 'Could not play browser audio: oscillator blocked',
    }));
  });
});
