import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observeUsedAssetsForServiceWorker, reportUsedAssetsToServiceWorker } from '../src/utils/pwa';

let resources: Array<{ name: string }>;
let notify: (list: PerformanceObserverEntryList) => void;
let controller: ServiceWorker | null;
let container: ServiceWorkerContainer;
const postMessage = vi.fn();
const observe = vi.fn();
const disconnect = vi.fn();
const notifyResources = (names: string[]) => notify({ getEntries: () => names.map(name => ({ name })) } as PerformanceObserverEntryList);

beforeEach(() => {
  vi.clearAllMocks();
  resources = [];
  controller = null;
  container = { get controller() { return controller; } } as ServiceWorkerContainer;
  vi.stubGlobal('window', { location: { origin: 'https://example.test' } });
  vi.stubGlobal('performance', { getEntriesByType: () => resources });
  vi.stubGlobal('PerformanceObserver', class {
    constructor(callback: typeof notify) { notify = callback; }
    observe = observe;
    disconnect = disconnect;
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('late bundle cache reporting', () => {
  it('reports an import that finishes after the initial controller handoff', () => {
    const stop = observeUsedAssetsForServiceWorker(container);
    expect(observe).toHaveBeenCalledWith({ type: 'resource', buffered: true });
    resources.push({ name: 'https://example.test/assets/dashboard.js' });
    notifyResources(resources.map(entry => entry.name));
    expect(postMessage).not.toHaveBeenCalled();
    controller = { postMessage } as unknown as ServiceWorker;
    reportUsedAssetsToServiceWorker(container);
    expect(postMessage).toHaveBeenLastCalledWith({ type: 'CACHE_USED_ASSETS', urls: ['https://example.test/assets/dashboard.js'] });
    resources.push({ name: 'https://example.test/assets/paste-dialog.js' });
    notifyResources(['https://example.test/assets/paste-dialog.js']);
    expect(postMessage).toHaveBeenLastCalledWith({ type: 'CACHE_USED_ASSETS', urls: resources.map(entry => entry.name) });
    expect(postMessage).toHaveBeenCalledTimes(2);
    stop();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('ignores unrelated resources and origin lookalikes', () => {
    controller = { postMessage } as unknown as ServiceWorker;
    observeUsedAssetsForServiceWorker(container);
    resources.push({ name: 'https://example.test.evil/assets/tracker.js' });
    notifyResources(['https://example.test/themes/board.svg', 'https://example.test.evil/assets/tracker.js']);
    expect(postMessage).not.toHaveBeenCalled();
    reportUsedAssetsToServiceWorker(container);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('still supports explicit reporting when resource observation is unavailable', () => {
    vi.stubGlobal('PerformanceObserver', undefined);
    controller = { postMessage } as unknown as ServiceWorker;
    resources.push({ name: 'https://example.test/assets/main.js' });
    expect(() => observeUsedAssetsForServiceWorker(container)()).not.toThrow();
    reportUsedAssetsToServiceWorker(container);
    expect(postMessage).toHaveBeenCalledTimes(1);
  });

  it('does not interrupt loading if the browser blocks resource observation or messaging', () => {
    observe.mockImplementationOnce(() => { throw new Error('Observation blocked'); });
    expect(() => observeUsedAssetsForServiceWorker(container)()).not.toThrow();
    controller = { postMessage: () => { throw new Error('Message blocked'); } } as unknown as ServiceWorker;
    observeUsedAssetsForServiceWorker(container);
    resources.push({ name: 'https://example.test/assets/main.js' });
    expect(() => notifyResources(resources.map(entry => entry.name))).not.toThrow();
  });
});
