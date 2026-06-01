import { describe, expect, it } from 'vitest';
import {
  getActiveConnectedGamepad,
  getConnectedGamepad,
  getConnectedGamepads,
  getGamepadConnectionSnapshot,
  getGamepadsSafe,
} from '../src/utils/gamepadAccess';

function fakeGamepad(id: string, connected = true, timestamp = 0, index = 0): Gamepad {
  return {
    axes: [],
    buttons: [],
    connected,
    hapticActuators: [],
    id,
    index,
    mapping: '',
    timestamp,
    vibrationActuator: null,
  } as unknown as Gamepad;
}

describe('gamepad access helpers', () => {
  it('returns connected gamepads from a navigator-like object', () => {
    const connected = fakeGamepad('Review pad');
    const disconnected = fakeGamepad('Old pad', false);
    const target = {
      getGamepads: () => [null, disconnected, connected],
    } as unknown as Navigator;

    expect(getGamepadsSafe(target)).toEqual([disconnected, connected]);
    expect(getConnectedGamepads(target)).toEqual([connected]);
    expect(getConnectedGamepad(target)).toBe(connected);
  });

  it('uses the most recently active connected gamepad when several are present', () => {
    const first = fakeGamepad('First pad', true, 12, 0);
    const active = fakeGamepad('Recently moved pad', true, 48, 1);
    const disconnected = fakeGamepad('Old pad', false, 100, 2);
    const target = {
      getGamepads: () => [first, active, disconnected],
    } as unknown as Navigator;

    expect(getActiveConnectedGamepad(target)).toBe(active);
    expect(getConnectedGamepad(target)).toBe(active);
    expect(getGamepadConnectionSnapshot(target)).toEqual({ active, count: 2 });
  });

  it('treats missing or blocked getGamepads as no gamepad', () => {
    const missing = {} as Navigator;
    const blocked = {
      get getGamepads() {
        throw new Error('gamepad blocked');
      },
    } as unknown as Navigator;

    expect(getGamepadsSafe(null)).toEqual([]);
    expect(getGamepadsSafe(missing)).toEqual([]);
    expect(getGamepadsSafe(blocked)).toEqual([]);
    expect(getConnectedGamepad(blocked)).toBeNull();
    expect(getGamepadConnectionSnapshot(blocked)).toEqual({ active: null, count: 0 });
  });
});
