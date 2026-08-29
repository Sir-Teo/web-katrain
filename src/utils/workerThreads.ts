/**
 * How many WASM threads the search may take.
 *
 * This was `Math.max(1, Math.min(8, hardwareConcurrency))` inline in the
 * worker: every core up to eight, on any machine, with no other signal. Two
 * things are wrong with that, and web-xiangqi's `analysisProfile` gets both
 * right for the same question about Pikafish.
 *
 * Take every core and there is none left for the thread painting the board.
 * The search is the reason the app exists, so it should take most of the
 * machine — but a hint that lands after the user has already played their next
 * move is worth less than one that lands while the board still responds to
 * touch. Leaving two cores is the trade web-xiangqi settled on, and it costs
 * nothing on the desktops that were already capped at eight.
 *
 * Memory is the signal that was missing entirely. Each XNNPACK thread carries
 * its own arena, and a phone with eight cores and 4GB is not a machine that
 * should run eight of them beside a neural network.
 *
 * `navigator.deviceMemory` is compared below 4 rather than at any higher
 * number on purpose: browsers disagree about the top of its range — the spec
 * describes clamping it to limit fingerprinting, and Chromium 148 was observed
 * reporting 32 — so a test like `<= 8` sorts the same machine differently
 * depending on the browser. Every browser agrees about 4.
 */
export const MAX_SEARCH_THREADS = 8;
export const CORES_RESERVED_FOR_UI = 2;
export const LOW_MEMORY_GB = 4;
export const LOW_MEMORY_MAX_THREADS = 2;

export type ThreadBudgetInput = {
  hardwareConcurrency?: number;
  deviceMemoryGB?: number;
};

export function resolveSearchThreadCount({
  hardwareConcurrency,
  deviceMemoryGB,
}: ThreadBudgetInput): number {
  const cores = Number(hardwareConcurrency);
  const usableCores = Number.isFinite(cores) && cores >= 1 ? Math.floor(cores) : 1;

  const memory = Number(deviceMemoryGB);
  const knownMemory = Number.isFinite(memory) && memory > 0 ? memory : null;
  const ceiling = knownMemory !== null && knownMemory < LOW_MEMORY_GB
    ? LOW_MEMORY_MAX_THREADS
    : MAX_SEARCH_THREADS;

  return Math.max(1, Math.min(ceiling, usableCores - CORES_RESERVED_FOR_UI));
}

/** Reads the signals a worker actually has: no window, no matchMedia. */
export function detectSearchThreadCount(scope: {
  navigator?: { hardwareConcurrency?: number; deviceMemory?: number };
} = globalThis as never): number {
  return resolveSearchThreadCount({
    hardwareConcurrency: scope.navigator?.hardwareConcurrency,
    deviceMemoryGB: scope.navigator?.deviceMemory,
  });
}
