import { describe, expect, it, vi } from 'vitest';
import { createTextImportRequests } from '../src/utils/textImportRequests';

describe('text import ownership', () => {
  it('captures the current game separately for each request', () => {
    let rootId = 'first-game';
    const requests = createTextImportRequests(() => rootId);
    const first = requests.begin();
    rootId = 'selected-game';
    expect(first.rootId).toBe('first-game');
    expect(requests.begin().rootId).toBe('selected-game');
  });

  it('cancels the previous read or download when another import starts', () => {
    const requests = createTextImportRequests(() => 'game');
    const first = requests.begin();
    const second = requests.begin();
    expect(first.signal.aborted).toBe(true);
    expect(requests.isCurrent(first)).toBe(false);
    expect(second.signal.aborted).toBe(false);
    expect(requests.isCurrent(second)).toBe(true);
  });

  it('does not let an older completion clear a newer pending import', () => {
    const requests = createTextImportRequests(() => 'game');
    const first = requests.begin();
    const second = requests.begin();
    requests.finish(first);
    expect(requests.isCurrent(second)).toBe(true);
    requests.begin();
    expect(second.signal.aborted).toBe(true);
  });

  it('releases a completed request without aborting its successful signal later', () => {
    const requests = createTextImportRequests(() => 'game');
    const first = requests.begin();
    requests.finish(first);
    expect(requests.isCurrent(first)).toBe(false);
    requests.begin();
    requests.cancel();
    expect(first.signal.aborted).toBe(false);
  });

  it('cancels the active request and allows a fresh retry', () => {
    const requests = createTextImportRequests(() => 'game');
    const first = requests.begin();
    requests.cancel();
    requests.cancel();
    expect(first.signal.aborted).toBe(true);
    expect(requests.isCurrent(first)).toBe(false);
    expect(requests.isCurrent(requests.begin())).toBe(true);
  });

  it('propagates dialog cancellation and its reason', () => {
    const requests = createTextImportRequests(() => 'game');
    const dialog = new AbortController();
    const request = requests.begin(dialog.signal);
    dialog.abort('dialog closed');
    expect(request.signal.aborted).toBe(true);
    expect(request.signal.reason).toBe('dialog closed');
    expect(requests.isCurrent(request)).toBe(false);
  });

  it('recognizes a dialog that was already canceled', () => {
    const requests = createTextImportRequests(() => 'game');
    const dialog = new AbortController();
    dialog.abort();
    const request = requests.begin(dialog.signal);
    expect(request.signal.aborted).toBe(true);
    expect(requests.isCurrent(request)).toBe(false);
  });

  it('unlinks a superseded dialog without canceling its successor', () => {
    const requests = createTextImportRequests(() => 'game');
    const dialog = new AbortController();
    const remove = vi.spyOn(dialog.signal, 'removeEventListener');
    requests.begin(dialog.signal);
    const latest = requests.begin();
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    dialog.abort();
    expect(latest.signal.aborted).toBe(false);
    expect(requests.isCurrent(latest)).toBe(true);
  });

  it('unlinks a finished dialog so closing it cannot cancel a completed import', () => {
    const requests = createTextImportRequests(() => 'game');
    const dialog = new AbortController();
    const request = requests.begin(dialog.signal);
    requests.finish(request);
    dialog.abort();
    expect(request.signal.aborted).toBe(false);
  });
});
