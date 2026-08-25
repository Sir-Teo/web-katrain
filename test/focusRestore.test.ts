import { afterEach, describe, expect, it, vi } from 'vitest';
import { restoreFocusIfUnclaimed } from '../src/utils/focusRestore';

// The suite runs without a DOM, so stand in a minimal document. body is the
// identity the guard compares against, so it only has to be a stable object.
const body = { tag: 'body' };
const stubDocument = (activeElement: unknown) => {
  vi.stubGlobal('document', { body, activeElement });
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('restoreFocusIfUnclaimed', () => {
  it('hands focus back when a removed element left it on the body', () => {
    stubDocument(body);
    const trigger = { focus: vi.fn() } as unknown as HTMLElement;

    restoreFocusIfUnclaimed(trigger);

    expect(trigger.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('hands focus back when nothing is focused at all', () => {
    stubDocument(null);
    const trigger = { focus: vi.fn() } as unknown as HTMLElement;

    restoreFocusIfUnclaimed(trigger);

    expect(trigger.focus).toHaveBeenCalledOnce();
  });

  it('leaves focus alone once a dialog has taken it', () => {
    // The sheet closes and a dialog opens from the same action. The dialog wins
    // the race, and reclaiming would put focus behind its own scrim.
    stubDocument({ tag: 'dialog' });
    const trigger = { focus: vi.fn() } as unknown as HTMLElement;

    restoreFocusIfUnclaimed(trigger);

    expect(trigger.focus).not.toHaveBeenCalled();
  });

  it('does nothing without a trigger to restore to', () => {
    stubDocument(body);

    expect(() => restoreFocusIfUnclaimed(null)).not.toThrow();
  });
});
