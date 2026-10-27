import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadNewOgsGames, listOgsFinishedGames, resolveOgsPlayer, type OgsGameSummary } from '../src/utils/ogsSync';
import { resetOgsFetchQueueForTests } from '../src/utils/ogsQueue';

beforeEach(() => resetOgsFetchQueueForTests());
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const game = (id: number): OgsGameSummary => ({ id, name: 'Study', black: 'Alice', white: 'Bob', boardSize: 9, ended: '2026-10-25' });
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });

function heldResponse() {
  let release!: (response: Response) => void;
  const response = new Promise<Response>(resolve => { release = resolve; });
  return { response, release };
}

describe('OGS sync cancellation', () => {
  it('forwards cancellation to a player lookup and rejects an ignored late response', async () => {
    const held = heldResponse();
    const fetchMock = vi.fn(() => held.response);
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const lookup = resolveOgsPlayer('Alice', controller.signal);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    controller.abort();
    held.release(json({ results: [{ id: 42, username: 'Alice' }] }));
    await expect(lookup).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('username=Alice'), { method: 'GET', signal: controller.signal });
  });

  it('stops pagination after a cancelled page arrives', async () => {
    const held = heldResponse();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ results: [], next: 'https://online-go.com/api/v1/players/42/games/?page=2' }))
      .mockReturnValueOnce(held.response);
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const listing = listOgsFinishedGames(42, 25, controller.signal);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    controller.abort();
    held.release(json({ results: [], next: 'https://online-go.com/api/v1/players/42/games/?page=3' }));
    await expect(listing).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ signal: controller.signal });
  });

  it('does not keep or classify a cancelled SGF as a failed download', async () => {
    const held = heldResponse();
    const fetchMock = vi.fn(() => held.response);
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const downloading = downloadNewOgsGames([game(1), game(2)], new Set(), undefined, undefined, controller.signal);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    controller.abort();
    held.release(new Response('(;SZ[9];B[dd])'));
    expect(await downloading).toEqual({ synced: [], skipped: 0, failed: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/games/1/sgf'), { method: 'GET', signal: controller.signal });
  });

  it('makes no requests for an already-cancelled sync', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort();
    await expect(resolveOgsPlayer('Alice', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    await expect(listOgsFinishedGames(42, 25, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(await downloadNewOgsGames([game(1)], new Set(), undefined, undefined, controller.signal))
      .toEqual({ synced: [], skipped: 0, failed: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still supports cancellation callbacks after an in-flight download', async () => {
    const held = heldResponse();
    const fetchMock = vi.fn(() => held.response);
    vi.stubGlobal('fetch', fetchMock);
    let cancelled = false;
    const downloading = downloadNewOgsGames([game(1), game(2)], new Set(), undefined, () => cancelled);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    cancelled = true;
    held.release(new Response('(;SZ[9];B[dd])'));
    expect(await downloading).toEqual({ synced: [], skipped: 0, failed: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('discards a JSON body completed after cancellation', async () => {
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const response = new Response(new ReadableStream<Uint8Array>({ start(controller) { stream = controller; } }));
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const lookup = resolveOgsPlayer('Alice', controller.signal);
    await vi.waitFor(() => expect(response.body?.locked).toBe(true));
    controller.abort();
    stream.enqueue(new TextEncoder().encode('{"results":[{"id":42,"username":"Alice"}]}'));
    stream.close();
    await expect(lookup).rejects.toMatchObject({ name: 'AbortError' });
  });
});
