import { describe, expect, it } from 'vitest';
import { getConnectedGamepad, getGamepadsSafe } from '../src/utils/gamepadAccess';

function fakeGamepad(id: string, connected = true): Gamepad {
  return {
    axes: [],
    buttons: [],
    connected,
    hapticActuators: [],
    id,
    index: 0,
    mapping: '',
    timestamp: 0,
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
    expect(getConnectedGamepad(target)).toBe(connected);
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
  });
});
