/**
 * KaTrain's "Set up Position": the engine plays both sides to a chosen move
 * number, steering toward a chosen score, so study can start from a realistic
 * middlegame. These helpers keep the wording and the bounds in one place.
 */

export type SetupPositionRequest = {
  untilMove: number;
  targetAdvantage: number;
};

export const SETUP_POSITION_MIN_MOVE = 2;
export const SETUP_POSITION_MAX_MOVE = 400;
export const SETUP_POSITION_MAX_ADVANTAGE = 100;

export const clampSetupPositionMove = (value: number): number => {
  if (!Number.isFinite(value)) return SETUP_POSITION_MIN_MOVE;
  return Math.max(SETUP_POSITION_MIN_MOVE, Math.min(SETUP_POSITION_MAX_MOVE, Math.round(value)));
};

export const clampSetupPositionAdvantage = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-SETUP_POSITION_MAX_ADVANTAGE, Math.min(SETUP_POSITION_MAX_ADVANTAGE, value));
};

/** Plain-language echo of what the generator is about to make. */
export const setupPositionSummary = (values: SetupPositionRequest): string => {
  const points = Math.abs(values.targetAdvantage);
  if (points < 0.5) return `An even position at move ${values.untilMove}.`;
  const rounded = Number.isInteger(points) ? points.toFixed(0) : points.toFixed(1);
  const leader = values.targetAdvantage > 0 ? 'Black' : 'White';
  return `${leader} ahead by about ${rounded} points at move ${values.untilMove}.`;
};

/** Progress line for the status bar while a position is being generated. */
export const setupPositionProgressLabel = (progress: { move: number; untilMove: number }): string =>
  `Generating position… move ${progress.move}/${progress.untilMove} (Esc to stop)`;
