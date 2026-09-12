import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluate, navigate } from '../scripts/lib/browser.mjs';

afterEach(() => vi.useRealTimers());

function protocol(navigation) {
  const listeners = new Set();
  return {
    listeners,
    send: vi.fn(async (method) => method === 'Page.navigate' ? navigation() : { result: {} }),
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    loaded(frameId, loaderId) {
      for (const listener of listeners) listener({
        method: 'Page.lifecycleEvent', params: { name: 'DOMContentLoaded', frameId, loaderId },
      });
    },
  };
}

describe('browser navigation readiness', () => {
  it('ignores the previous document and child frames while waiting for the requested page', async () => {
    const cdp = protocol(() => ({ result: { frameId: 'main', loaderId: 'new' } }));
    let finished = false;
    const pending = navigate(cdp, 'http://example.test/').then(() => { finished = true; });
    await vi.waitFor(() => expect(cdp.send).toHaveBeenCalledWith('Page.navigate', { url: 'http://example.test/' }));
    cdp.loaded('main', 'old');
    cdp.loaded('child', 'new');
    await Promise.resolve();
    expect(finished).toBe(false);
    cdp.loaded('main', 'new');
    await pending;
    expect(finished).toBe(true);
    expect(cdp.listeners.size).toBe(0);
  });

  it('handles a document that loads before the navigation reply arrives', async () => {
    const cdp = protocol(() => {
      cdp.loaded('main', 'new');
      return { result: { frameId: 'main', loaderId: 'new' } };
    });
    await navigate(cdp, 'http://example.test/');
    expect(cdp.listeners.size).toBe(0);
  });

  it('does not wait for a new document on a fragment navigation', async () => {
    const cdp = protocol(() => ({ result: { frameId: 'main' } }));
    await navigate(cdp, 'http://example.test/#board');
    expect(cdp.listeners.size).toBe(0);
  });

  it.each([
    { error: { message: 'Target closed' } },
    { result: { errorText: 'net::ERR_CONNECTION_REFUSED' } },
    { result: { frameId: 'main', loaderId: 'new', isDownload: true } },
  ])('reports navigation failure without retrying: %j', async (reply) => {
    const cdp = protocol(() => reply);
    await expect(navigate(cdp, 'http://example.test/')).rejects.toThrow();
    expect(cdp.send.mock.calls.filter(([method]) => method === 'Page.navigate')).toHaveLength(1);
    expect(cdp.listeners.size).toBe(0);
  });

  it('reports a stalled navigation without restarting it and removes its listener', async () => {
    vi.useFakeTimers();
    const cdp = protocol(() => new Promise(() => {}));
    const pending = expect(navigate(cdp, 'http://example.test/', 100)).rejects.toThrow('DOMContentLoaded');
    await vi.advanceTimersByTimeAsync(100);
    await pending;
    expect(cdp.send.mock.calls.filter(([method]) => method === 'Page.navigate')).toHaveLength(1);
    expect(cdp.listeners.size).toBe(0);
  });

  it('does not replay actions when their execution context disappears', async () => {
    const cdp = { send: vi.fn().mockResolvedValue({ error: { message: 'Inspected target navigated or closed' } }) };
    await expect(evaluate(cdp, 'document.querySelector("button").click()')).rejects.toThrow('not retried');
    expect(cdp.send).toHaveBeenCalledTimes(1);
  });

  it('preserves the JavaScript exception and stack in a failed browser check', async () => {
    const cdp = { send: vi.fn().mockResolvedValue({ result: {
      exceptionDetails: { text: 'Uncaught', exception: { description: 'Error: Missing board\n    at probe:1' } },
    } }) };
    await expect(evaluate(cdp, 'probe()')).rejects.toThrow('Error: Missing board\n    at probe:1');
  });
});
