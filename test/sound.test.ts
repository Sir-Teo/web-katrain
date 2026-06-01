import { afterEach, describe, expect, it } from 'vitest';
import { playCaptureSound, playNewGameSound, playPassSound, playStoneSound, resetAudioContextForTests } from '../src/utils/sound';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

function restoreWindow() {
  if (originalWindow) {
    Object.defineProperty(globalThis, 'window', originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, 'window');
  }
}

afterEach(() => {
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

  it('swallows oscillator setup failures after context creation', () => {
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
  });
});
