import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { installNumberInputWheelGuard } from '../src/utils/numberInputWheel';

/** The two document pieces the guard touches; the suite runs in node. */
function fakeDoc(active: { tagName: string; type?: string; blur: () => void } | null) {
  const listeners: Array<{ type: string; fn: (e: unknown) => void; options: unknown }> = [];
  const removed: unknown[] = [];
  const doc = {
    activeElement: active,
    addEventListener: (type: string, fn: (e: unknown) => void, options: unknown) =>
      listeners.push({ type, fn, options }),
    removeEventListener: (_type: string, fn: unknown, options: unknown) =>
      removed.push({ fn, options }),
  };
  const stop = installNumberInputWheelGuard(doc as unknown as Document);
  return { doc, listeners, removed, stop, fire: (target: unknown) => listeners[0].fn({ target }) };
}

const numberInput = () => {
  let blurred = 0;
  return { el: { tagName: 'INPUT', type: 'number', blur: () => { blurred += 1; } }, blurs: () => blurred };
};

describe('the wheel does not edit a focused number input', () => {
  it('listens for the wheel where the step cannot outrun it', () => {
    // Capture, so the blur lands before the default step; passive, because the
    // scroll the person actually wanted must still happen.
    const { listeners } = fakeDoc(null);
    expect(listeners).toHaveLength(1);
    expect(listeners[0].type).toBe('wheel');
    expect(listeners[0].options).toEqual({ passive: true, capture: true });
  });

  it('blurs the focused number input under the pointer', () => {
    const input = numberInput();
    const { fire } = fakeDoc(input.el);
    fire(input.el);
    expect(input.blurs()).toBe(1);
  });

  it('leaves a field the wheel is only passing over alone', () => {
    // Focused elsewhere: blurring here would steal focus for nothing.
    const input = numberInput();
    const { fire } = fakeDoc(input.el);
    fire({ tagName: 'DIV' });
    expect(input.blurs()).toBe(0);
  });

  it('leaves other inputs and an empty focus alone', () => {
    let blurred = 0;
    const text = { tagName: 'INPUT', type: 'text', blur: () => { blurred += 1; } };
    const { fire } = fakeDoc(text);
    fire(text);
    expect(blurred).toBe(0);
    expect(() => fakeDoc(null).fire({ tagName: 'INPUT' })).not.toThrow();
  });

  it('removes the listener it added', () => {
    const { stop, listeners, removed } = fakeDoc(null);
    stop();
    expect(removed).toEqual([{ fn: listeners[0].fn, options: { capture: true } }]);
  });
});

describe('the guard is installed once, for the whole app', () => {
  it('sits with the other global handlers at start-up', () => {
    // Number inputs are spread across Settings, New game, the analysis dialogs
    // and the desktop rail; one document listener beats a prop on each.
    const main = readFileSync('src/main.tsx', 'utf8');
    expect(main).toContain("import { installNumberInputWheelGuard } from './utils/numberInputWheel.ts'");
    expect(main).toContain('installGlobalErrorHandlers()\ninstallNumberInputWheelGuard()');
  });
});
