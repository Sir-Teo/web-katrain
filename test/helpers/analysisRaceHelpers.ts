export const waitFor = async (predicate: () => boolean, label = 'store state') => {
  for (let i = 0; i < 400; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('Timed out waiting for ' + label);
};
export const sleepMs = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const payload = (over: Record<string, unknown> = {}) => ({
  rootWinRate: 0.5,
  rootScoreLead: 0,
  rootScoreSelfplay: 0,
  rootScoreStdev: 30,
  moves: [],
  ownership: new Array(361).fill(0),
  ...over,
});
export const deepMove = { x: 2, y: 2, winRate: 0.6, scoreLead: 1, scoreSelfplay: 1, scoreStdev: 20, visits: 4000, pointsLost: 0, winRateLost: 0, order: 0, prior: 0.3, pv: ['C17'] };
