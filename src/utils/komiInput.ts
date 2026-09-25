/** Beyond this a komi cannot describe a game; a 19x19 board holds 361 points. */
export const MAX_KOMI = 1000;

/**
 * The komi a player typed, or null when the field does not hold one: blank,
 * not a number, or past any board's size. `Number('')` is 0, a legal komi, so
 * a cleared field has to be told apart before it is converted.
 */
export function parseKomiInput(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && Math.abs(value) <= MAX_KOMI ? value : null;
}
