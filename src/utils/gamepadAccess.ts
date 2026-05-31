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

export function getConnectedGamepad(target?: Navigator | null): Gamepad | null {
  return getGamepadsSafe(target).find((pad) => pad.connected) ?? null;
}
