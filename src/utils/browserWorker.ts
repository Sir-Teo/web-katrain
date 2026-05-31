export function getWorkerConstructor(): typeof Worker | null {
  try {
    const workerConstructor = globalThis.Worker;
    return typeof workerConstructor === 'function' ? workerConstructor : null;
  } catch {
    return null;
  }
}
