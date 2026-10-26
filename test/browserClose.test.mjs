import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeBrowser } from '../scripts/lib/browser.mjs';

afterEach(() => vi.useRealTimers());

function processFixture() {
  const child = Object.assign(new EventEmitter(), {
    pid: 42, exitCode: null, signalCode: null,
    kill: vi.fn(() => true), unref: vi.fn(),
    stdout: { removeAllListeners: vi.fn(), destroy: vi.fn() },
    stderr: { removeAllListeners: vi.fn(), destroy: vi.fn() },
  });
  const exit = () => { child.exitCode = 0; child.emit('exit', 0); };
  return { child, exit };
}

describe('browser process cleanup', () => {
  it('closes an available connection when Chrome never started', async () => {
    const cdp = { close: vi.fn(), send: vi.fn() };
    await closeBrowser(cdp);
    expect(cdp.close).toHaveBeenCalledOnce();
    expect(cdp.send).not.toHaveBeenCalled();
  });

  it('does not signal an already exited or signaled process', async () => {
    for (const state of [{ exitCode: 0 }, { signalCode: 'SIGTERM' }]) {
      const { child } = processFixture();
      Object.assign(child, state);
      const cdp = { close: vi.fn(), send: vi.fn() };
      await closeBrowser(cdp, child);
      expect(child.kill).not.toHaveBeenCalled();
      expect(cdp.send).not.toHaveBeenCalled();
      expect(child.stdout.destroy).toHaveBeenCalledOnce();
    }
  });

  it('lets Browser.close exit the process before closing the connection', async () => {
    vi.useFakeTimers();
    const { child, exit } = processFixture();
    const events = [];
    const cdp = {
      send: vi.fn(method => { events.push(method); exit(); return new Promise(() => {}); }),
      close: vi.fn(() => events.push('disconnect')),
    };
    await closeBrowser(cdp, child);
    expect(events).toEqual(['Browser.close', 'disconnect']);
    expect(child.kill).not.toHaveBeenCalled();
    expect(child.listenerCount('exit')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('falls back to SIGTERM when the protocol command is rejected', async () => {
    vi.useFakeTimers();
    const { child, exit } = processFixture();
    child.kill.mockImplementation(() => { exit(); return true; });
    const cdp = { send: vi.fn().mockRejectedValue(new Error('disconnected')), close: vi.fn() };
    const pending = closeBrowser(cdp, child);
    await vi.advanceTimersByTimeAsync(1000);
    await pending;
    expect(child.kill.mock.calls).toEqual([['SIGTERM']]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses SIGKILL if Chrome ignores both graceful close and SIGTERM', async () => {
    vi.useFakeTimers();
    const { child, exit } = processFixture();
    child.kill.mockImplementation(signal => { if (signal === 'SIGKILL') exit(); return true; });
    const cdp = { send: vi.fn(() => new Promise(() => {})), close: vi.fn() };
    const pending = closeBrowser(cdp, child);
    await vi.advanceTimersByTimeAsync(2000);
    await pending;
    expect(child.kill.mock.calls).toEqual([['SIGTERM'], ['SIGKILL']]);
    expect(cdp.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds cleanup even if the process never acknowledges its exit', async () => {
    vi.useFakeTimers();
    const { child } = processFixture();
    const cdp = { send: vi.fn(() => new Promise(() => {})), close: vi.fn() };
    const pending = closeBrowser(cdp, child);
    await vi.advanceTimersByTimeAsync(3000);
    await pending;
    expect(child.kill.mock.calls).toEqual([['SIGTERM'], ['SIGKILL']]);
    expect(child.listenerCount('exit')).toBe(0);
    expect(child.unref).toHaveBeenCalledOnce();
    expect(child.stderr.destroy).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses the process fallback when no protocol connection was established', async () => {
    const { child, exit } = processFixture();
    child.kill.mockImplementation(() => { exit(); return true; });
    await closeBrowser(undefined, child);
    expect(child.kill.mock.calls).toEqual([['SIGTERM']]);
  });
});
