export type GamepadNavigationCommand =
  | 'back'
  | 'forward'
  | 'backFast'
  | 'forwardFast'
  | 'start'
  | 'end'
  | 'branchPrev'
  | 'branchNext';

export type GamepadNavigationInput = {
  command: GamepadNavigationCommand;
  key: string;
};

export type GamepadLike = {
  axes?: ArrayLike<number>;
  buttons?: ArrayLike<{ pressed?: boolean; value?: number }>;
};

const AXIS_THRESHOLD = 0.65;

function isButtonPressed(gamepad: GamepadLike, index: number): boolean {
  const button = gamepad.buttons?.[index];
  return !!button?.pressed || (button?.value ?? 0) > 0.5;
}

function buttonInput(gamepad: GamepadLike, index: number, command: GamepadNavigationCommand): GamepadNavigationInput | null {
  return isButtonPressed(gamepad, index) ? { command, key: `button:${index}` } : null;
}

function axisInput(
  gamepad: GamepadLike,
  index: number,
  direction: -1 | 1,
  command: GamepadNavigationCommand,
  threshold = AXIS_THRESHOLD
): GamepadNavigationInput | null {
  const value = gamepad.axes?.[index] ?? 0;
  if (direction < 0 && value <= -threshold) return { command, key: `axis:${index}:negative` };
  if (direction > 0 && value >= threshold) return { command, key: `axis:${index}:positive` };
  return null;
}

export function getGamepadNavigationInput(gamepad: GamepadLike): GamepadNavigationInput | null {
  return (
    buttonInput(gamepad, 4, 'backFast') ??
    buttonInput(gamepad, 5, 'forwardFast') ??
    buttonInput(gamepad, 14, 'back') ??
    buttonInput(gamepad, 15, 'forward') ??
    buttonInput(gamepad, 12, 'branchPrev') ??
    buttonInput(gamepad, 13, 'branchNext') ??
    buttonInput(gamepad, 8, 'start') ??
    buttonInput(gamepad, 9, 'end') ??
    buttonInput(gamepad, 1, 'back') ??
    buttonInput(gamepad, 0, 'forward') ??
    axisInput(gamepad, 0, -1, 'back') ??
    axisInput(gamepad, 0, 1, 'forward') ??
    axisInput(gamepad, 1, -1, 'branchPrev') ??
    axisInput(gamepad, 1, 1, 'branchNext')
  );
}
