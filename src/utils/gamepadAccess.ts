export function getGamepadsSafe(target?: Navigator | null): Gamepad[] {
  const source = target ?? (typeof navigator !== 'undefined' ? navigator : null);
  if (!source) return [];
  try {
    const getGamepads = source.getGamepads;
    if (typeof getGamepads !== 'function') return [];
    return Array.from(getGamepads.call(source) ?? []).filter((pad): pad is Gamepad => !!pad);
  } catch {
    return [];
  }
}

export function getConnectedGamepads(target?: Navigator | null): Gamepad[] {
  return getGamepadsSafe(target).filter((pad) => pad.connected);
}

function getGamepadTimestamp(gamepad: Gamepad): number {
  return Number.isFinite(gamepad.timestamp) ? gamepad.timestamp : 0;
}

export function getActiveConnectedGamepad(target?: Navigator | null): Gamepad | null {
  const connected = getConnectedGamepads(target);
  if (connected.length === 0) return null;
  return connected.reduce((active, pad) => (
    getGamepadTimestamp(pad) > getGamepadTimestamp(active) ? pad : active
  ));
}

export function getGamepadConnectionSnapshot(target?: Navigator | null): {
  active: Gamepad | null;
  count: number;
} {
  const connected = getConnectedGamepads(target);
  if (connected.length === 0) return { active: null, count: 0 };
  const active = connected.reduce((current, pad) => (
    getGamepadTimestamp(pad) > getGamepadTimestamp(current) ? pad : current
  ));
  return { active, count: connected.length };
}

export function getConnectedGamepad(target?: Navigator | null): Gamepad | null {
  return getActiveConnectedGamepad(target);
}
