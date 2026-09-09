import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createOverlayBackStack, type BackStackWindow } from '../src/utils/overlayBackStack';

/** A history just real enough to press back on. */
function fakeWindow() {
  const entries: unknown[] = [null];
  let listener: (() => void) | null = null;
  let timers: Array<{ id: number; fn: () => void } | null> = [];
  /** history.back() is asynchronous: the entry is still current when it
      returns, and the popstate lands later. Modelling that is the whole point
      of this fake -- the bug it exists for lived in that gap. */
  let pendingBack = 0;
  const win: BackStackWindow = {
    history: {
      get state() { return entries[entries.length - 1]; },
      pushState: (state) => { entries.push(state); },
      back: () => { pendingBack += 1; },
    },
    setTimeout: (fn) => { const id = timers.length + 1; timers.push({ id, fn }); return id; },
    clearTimeout: (id) => { timers = timers.map((t) => (t && t.id === id ? null : t)); },
    addEventListener: (_type, fn) => { listener = fn; },
    removeEventListener: () => { listener = null; },
  };
  const deliverBack = () => {
    while (pendingBack > 0) {
      pendingBack -= 1;
      if (entries.length > 1) entries.pop();
      listener?.();
    }
  };
  return {
    win,
    entries,
    /** Run whatever was deferred, then deliver any back() it issued. */
    tick: () => {
      const due = timers.filter(Boolean) as Array<{ id: number; fn: () => void }>;
      timers = [];
      for (const t of due) t.fn();
      deliverBack();
    },
    /** What the platform does on a back press: pop, then fire popstate. */
    pressBack: () => { if (entries.length > 1) entries.pop(); listener?.(); },
    listening: () => listener !== null,
  };
}

const closer = () => {
  const calls: number[] = [];
  return { calls, fn: (n: number) => () => calls.push(n) };
};

describe('back closes the overlay on top', () => {
  it('pushes one entry when the first overlay opens', () => {
    const w = fakeWindow();
    const stack = createOverlayBackStack(w.win);
    const c = closer();
    stack.open(c.fn(1));
    expect(w.entries).toHaveLength(2);
    expect(w.listening()).toBe(true);
  });

  it('does not stack an entry per overlay', () => {
    // Three deep is still one entry, so history cannot be left half-unwound.
    const w = fakeWindow();
    const stack = createOverlayBackStack(w.win);
    const c = closer();
    stack.open(c.fn(1));
    stack.open(c.fn(2));
    stack.open(c.fn(3));
    expect(w.entries).toHaveLength(2);
    expect(stack.depth()).toBe(3);
  });

  it('closes the innermost overlay, and re-arms for the ones under it', () => {
    const w = fakeWindow();
    const stack = createOverlayBackStack(w.win);
    const c = closer();
    stack.open(c.fn(1));
    stack.open(c.fn(2));

    w.pressBack();
    expect(c.calls).toEqual([2]);
    expect(stack.depth()).toBe(1);
    expect(w.entries).toHaveLength(2);   // pushed again for the one left

    w.pressBack();
    expect(c.calls).toEqual([2, 1]);
    expect(stack.depth()).toBe(0);
  });

  it('leaves history alone once the last overlay is gone', () => {
    const w = fakeWindow();
    const stack = createOverlayBackStack(w.win);
    const c = closer();
    stack.open(c.fn(1));
    w.pressBack();
    expect(w.entries).toHaveLength(1);
    // A further back press is the page's own, not ours.
    w.pressBack();
    expect(c.calls).toEqual([1]);
  });

  it('drops the entry when an overlay closes some other way', () => {
    // Otherwise the first back press after using the button would do nothing.
    const w = fakeWindow();
    const stack = createOverlayBackStack(w.win);
    const c = closer();
    const id = stack.open(c.fn(1));
    stack.release(id);
    w.tick();
    expect(w.entries).toHaveLength(1);
    expect(c.calls).toEqual([]);          // released, not closed again
    expect(stack.depth()).toBe(0);
  });

  it('keeps the entry while an outer overlay is still open', () => {
    const w = fakeWindow();
    const stack = createOverlayBackStack(w.win);
    const c = closer();
    stack.open(c.fn(1));
    const inner = stack.open(c.fn(2));
    stack.release(inner);
    w.tick();
    expect(w.entries).toHaveLength(2);
    w.pressBack();
    expect(c.calls).toEqual([1]);
  });

  it('ignores a release for an overlay back already took', () => {
    const w = fakeWindow();
    const stack = createOverlayBackStack(w.win);
    const c = closer();
    const id = stack.open(c.fn(1));
    w.pressBack();                        // closes it, which unmounts it...
    stack.release(id);                    // ...and the cleanup releases it
    w.tick();
    expect(w.entries).toHaveLength(1);
    expect(c.calls).toEqual([1]);
  });

  it('never goes back over an entry it did not push', () => {
    // A marker restored with a reloaded session is not ours, and going back
    // over it could leave the page.
    const w = fakeWindow();
    w.entries.push({ webKatrainOverlay: true });
    const stack = createOverlayBackStack(w.win);
    const c = closer();
    const id = stack.open(c.fn(1));
    expect(w.entries).toHaveLength(2);    // the stale marker was reused
    stack.release(id);
    w.tick();
    expect(w.entries).toHaveLength(2);    // and not popped
  });
});

describe('a close followed straight away by an open keeps its entry', () => {
  it('survives StrictMode running cleanup and effect back to back', () => {
    // React double-invokes every effect in development: open, release, open,
    // all in one tick. Before the drop was deferred, the second open found the
    // marker still in history -- back() had not landed yet -- skipped pushing,
    // and the next back press left the app.
    const w = fakeWindow();
    const stack = createOverlayBackStack(w.win);
    const c = closer();
    const first = stack.open(c.fn(1));
    stack.release(first);
    stack.open(c.fn(2));
    w.tick();
    expect(w.entries).toHaveLength(2);
    expect(stack.depth()).toBe(1);

    w.pressBack();
    expect(c.calls).toEqual([2]);
    expect(stack.depth()).toBe(0);
  });

  it('re-pushes for an overlay opened while a back is still in flight', () => {
    const w = fakeWindow();
    const stack = createOverlayBackStack(w.win);
    const c = closer();
    const first = stack.open(c.fn(1));
    stack.release(first);
    // The drop runs and issues back(), but the popstate has not arrived.
    const due = w.entries.length;
    expect(due).toBe(2);
    w.tick();                       // drop + delivery
    expect(w.entries).toHaveLength(1);

    stack.open(c.fn(2));
    w.tick();
    expect(w.entries).toHaveLength(2);
    w.pressBack();
    expect(c.calls).toEqual([2]);
  });
});

describe('the dismissal hook wires it up', () => {
  const hook = readFileSync('src/hooks/useEscapeToClose.ts', 'utf8');

  it('keeps back to coarse pointers', () => {
    // On a desktop back means navigate, and this app is often the only page in
    // its tab, so redefining it there would surprise for no gain.
    expect(hook).toContain("if (!mediaQueryMatches('(pointer: coarse)')) return;");
  });

  it('does not re-register on every render', () => {
    // Callers pass inline arrows -- UnsavedChangesModal's is
    // `() => onChoice('cancel')` -- so depending on onClose would push and pop
    // a history entry on each render.
    expect(hook).toContain('const closeRef = useRef(onClose);');
    expect(hook).toContain('const id = stack.open(() => closeRef.current());');
    expect(hook).toContain('  }, [active]);');
  });

  it('releases the entry when the overlay unmounts', () => {
    expect(hook).toContain('return () => stack.release(id);');
  });
});
