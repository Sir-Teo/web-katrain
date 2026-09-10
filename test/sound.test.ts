import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  playCaptureSound,
  playNewGameSound,
  playPassSound,
  playStoneSound,
  resetAudioContextForTests,
  resetSoundFailureReport,
  setSoundInitErrorHandler,
  warmAudioContext,
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

describe('warmAudioContext', () => {
  // Building the AudioContext is what made placing a first stone cost 85-100ms
  // of synchronous work and a 91ms long task; every later move cost 0.3ms.
  // Doing it from an idle callback moved the first move to 1.56ms and left no
  // long task at all.
  class CountingAudioContext {
    static constructed = 0;
    currentTime = 0;
    destination = {};
    state: AudioContextState = 'suspended';
    resume = () => Promise.resolve();
    constructor() {
      CountingAudioContext.constructed += 1;
    }
    createOscillator = () => ({
      connect: () => {},
      type: 'sine',
      frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      start: () => {},
      stop: () => {},
    });
    createGain = () => ({
      connect: () => {},
      gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
    });
  }

  const installAudio = () => {
    CountingAudioContext.constructed = 0;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { AudioContext: CountingAudioContext },
    });
  };

  it('builds the context once, and the first sound then reuses it', () => {
    installAudio();

    warmAudioContext();
    expect(CountingAudioContext.constructed).toBe(1);

    // The point of warming: the move that plays the first sound must not be
    // the one that constructs the device.
    warmAudioContext();
    playStoneSound();
    expect(CountingAudioContext.constructed).toBe(1);
  });

  it('stays harmless where there is no audio API at all', () => {
    Reflect.deleteProperty(globalThis, 'window');
    expect(() => warmAudioContext()).not.toThrow();
  });

  it('is only reached when sound is switched on', () => {
    // Nobody should have an audio device started for a feature they turned
    // off, so the caller carries the gate rather than this module.
    const layout = readFileSync('src/components/Layout.tsx', 'utf8');
    const call = layout.indexOf('warmAudioContext()');
    expect(call).toBeGreaterThan(-1);
    const effectStart = layout.lastIndexOf('useEffect(() => {', call);
    expect(layout.slice(effectStart, call)).toContain('settings.soundEnabled');
  });
});
