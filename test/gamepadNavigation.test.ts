import { describe, expect, it } from 'vitest';
import { getGamepadNavigationInput, type GamepadLike } from '../src/utils/gamepadNavigation';

const pad = (args: { id?: string; axes?: number[]; pressed?: number[]; values?: Record<number, number> }): GamepadLike => {
  const buttons = Array.from({ length: 16 }, (_, index) => ({
    pressed: args.pressed?.includes(index) ?? false,
    value: args.values?.[index] ?? 0,
  }));
  return { id: args.id, axes: args.axes ?? [0, 0], buttons };
};

describe('gamepad navigation mapping', () => {
  it('maps d-pad and face buttons to single-step navigation', () => {
    expect(getGamepadNavigationInput(pad({ pressed: [14] }))).toEqual({ command: 'back', key: 'button:14' });
    expect(getGamepadNavigationInput(pad({ pressed: [15] }))).toEqual({ command: 'forward', key: 'button:15' });
    expect(getGamepadNavigationInput(pad({ pressed: [1] }))).toEqual({ command: 'back', key: 'button:1' });
    expect(getGamepadNavigationInput(pad({ pressed: [0] }))).toEqual({ command: 'forward', key: 'button:0' });
  });

  it('maps shoulders, start/select, and vertical d-pad to review commands', () => {
    expect(getGamepadNavigationInput(pad({ pressed: [4] }))?.command).toBe('backFast');
    expect(getGamepadNavigationInput(pad({ pressed: [5] }))?.command).toBe('forwardFast');
    expect(getGamepadNavigationInput(pad({ pressed: [8] }))?.command).toBe('start');
    expect(getGamepadNavigationInput(pad({ pressed: [9] }))?.command).toBe('end');
    expect(getGamepadNavigationInput(pad({ pressed: [12] }))?.command).toBe('branchPrev');
    expect(getGamepadNavigationInput(pad({ pressed: [13] }))?.command).toBe('branchNext');
  });

  it('uses analog stick thresholds without firing near center', () => {
    expect(getGamepadNavigationInput(pad({ axes: [-0.7, 0] }))).toEqual({ command: 'back', key: 'axis:0:negative' });
    expect(getGamepadNavigationInput(pad({ axes: [0.7, 0] }))).toEqual({ command: 'forward', key: 'axis:0:positive' });
    expect(getGamepadNavigationInput(pad({ axes: [0, -0.7] }))?.command).toBe('branchPrev');
    expect(getGamepadNavigationInput(pad({ axes: [0, 0.7] }))?.command).toBe('branchNext');
    expect(getGamepadNavigationInput(pad({ axes: [0.4, 0.4] }))).toBeNull();
  });

  it('maps hat-axis d-pads used by compact controllers', () => {
    const axes = (hatValue: number) => {
      const values = Array.from({ length: 10 }, () => 0);
      values[9] = hatValue;
      return values;
    };

    expect(getGamepadNavigationInput(pad({ axes: axes(0.71429) }))).toEqual({ command: 'back', key: 'axis:9:hat-left' });
    expect(getGamepadNavigationInput(pad({ axes: axes(-0.42857) }))).toEqual({ command: 'forward', key: 'axis:9:hat-right' });
    expect(getGamepadNavigationInput(pad({ axes: axes(-1) }))).toEqual({ command: 'branchPrev', key: 'axis:9:hat-up' });
    expect(getGamepadNavigationInput(pad({ axes: axes(0.14286) }))).toEqual({ command: 'branchNext', key: 'axis:9:hat-down' });
    expect(getGamepadNavigationInput(pad({ axes: axes(1) }))).toBeNull();
  });

  it('maps the right stick to move and branch navigation', () => {
    expect(getGamepadNavigationInput(pad({ axes: [0, 0, -0.7, 0] }))).toEqual({
      command: 'back',
      key: 'axis:2:negative',
    });
    expect(getGamepadNavigationInput(pad({ axes: [0, 0, 0.7, 0] }))).toEqual({
      command: 'forward',
      key: 'axis:2:positive',
    });
    expect(getGamepadNavigationInput(pad({ axes: [0, 0, 0, -0.7] }))).toEqual({
      command: 'branchPrev',
      key: 'axis:3:negative',
    });
    expect(getGamepadNavigationInput(pad({ axes: [0, 0, 0, 0.7] }))).toEqual({
      command: 'branchNext',
      key: 'axis:3:positive',
    });
  });

  it('uses the Lite 2 right-stick Y axis quirk from Kaya controller mappings', () => {
    const axes = Array.from({ length: 6 }, () => 0);
    axes[5] = 0.7;

    expect(getGamepadNavigationInput(pad({ id: '8BitDo Lite 2 Vendor: 2dc8 Product: 5112', axes }))).toEqual({
      command: 'branchNext',
      key: 'axis:5:positive',
    });
  });
});
