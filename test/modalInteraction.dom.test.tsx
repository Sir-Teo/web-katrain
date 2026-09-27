// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AboutDialog } from '../src/components/AboutDialog';
import { AnalysisCacheClearConfirmModal } from '../src/components/AnalysisCacheClearConfirmModal';
import { KeyboardHelpModal } from '../src/components/KeyboardHelpModal';
import { ResignConfirmModal } from '../src/components/ResignConfirmModal';
import { UnsavedChangesModal } from '../src/components/UnsavedChangesModal';

// modalAccessibility.test.ts checks that the source mentions role="dialog" and
// an Escape hook. That proves the words are there, not that focus lands in the
// dialog, that Tab stays in it, that Escape reaches the handler, or that the
// label resolves to text. These tests mount the dialogs and drive them.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// happy-dom does no layout, so every element reports a zero rect and no
// offsetParent, and the focus trap would see nothing focusable. Give visible
// elements a box; `hidden` and display:none subtrees keep none.
const rectDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'getBoundingClientRect');
const offsetParentDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
const isRendered = (el: HTMLElement) => !el.closest('[hidden]') && el.style.display !== 'none';

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: HTMLElement) {
      const size = isRendered(this) ? 20 : 0;
      return { x: 0, y: 0, top: 0, left: 0, right: size, bottom: size, width: size, height: size, toJSON: () => ({}) };
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get(this: HTMLElement) {
      return isRendered(this) ? this.parentElement ?? document.body : null;
    },
  });
});

afterAll(() => {
  if (rectDescriptor) Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', rectDescriptor);
  if (offsetParentDescriptor) Object.defineProperty(HTMLElement.prototype, 'offsetParent', offsetParentDescriptor);
});

let host: HTMLDivElement;
let root: Root;
let opener: HTMLButtonElement;

beforeEach(() => {
  opener = document.createElement('button');
  opener.textContent = 'Open';
  document.body.appendChild(opener);
  opener.focus();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  opener.remove();
});

const render = async (element: React.ReactElement) => {
  act(() => root.render(element));
  // Dialogs that focus a specific control defer it by one animation frame.
  await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
};

const dialog = () => {
  const node = host.querySelector<HTMLElement>('[role="dialog"]');
  if (!node) throw new Error('no dialog rendered');
  return node;
};

/** The accessible name as a screen reader would compute it from aria-labelledby/aria-label. */
const accessibleName = (node: HTMLElement): string => {
  const labelledBy = node.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
      .join(' ')
      .trim();
    if (text) return text;
  }
  return node.getAttribute('aria-label')?.trim() ?? '';
};

const pressKey = (target: EventTarget, key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

const cases: Array<{
  name: string;
  expectedName: RegExp;
  mount: (onClose: () => void) => React.ReactElement;
}> = [
  { name: 'About', expectedName: /web katrain/i, mount: (onClose) => <AboutDialog onClose={onClose} returnFocus={opener} /> },
  {
    name: 'Keyboard help',
    expectedName: /keyboard/i,
    mount: (onClose) => <KeyboardHelpModal onClose={onClose} returnFocus={opener} />,
  },
  {
    name: 'Unsaved changes',
    expectedName: /unsaved|save/i,
    mount: (onClose) => <UnsavedChangesModal onChoice={(choice) => choice === 'cancel' && onClose()} />,
  },
  {
    name: 'Resign',
    expectedName: /resign/i,
    mount: (onClose) => <ResignConfirmModal player="black" onCancel={onClose} onConfirm={() => undefined} />,
  },
  {
    name: 'Clear analysis cache',
    expectedName: /analys|cache/i,
    mount: (onClose) => <AnalysisCacheClearConfirmModal count={3} onCancel={onClose} onConfirm={() => undefined} />,
  },
];

describe.each(cases)('$name dialog, rendered', ({ expectedName, mount }) => {
  it('has an accessible name that resolves to visible text', async () => {
    await render(mount(() => undefined));
    const node = dialog();
    expect(node.getAttribute('aria-modal')).toBe('true');
    expect(accessibleName(node)).toMatch(expectedName);
  });

  it('moves focus into the dialog when it opens', async () => {
    await render(mount(() => undefined));
    expect(dialog().contains(document.activeElement)).toBe(true);
  });

  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    await render(mount(() => undefined));
    const node = dialog();
    const focusable = [...node.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea')].filter(
      (el) => !el.hasAttribute('disabled') && el.tabIndex >= 0,
    );
    expect(focusable.length).toBeGreaterThan(0);

    const last = focusable[focusable.length - 1];
    act(() => last.focus());
    const forward = pressKey(last, 'Tab');
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(focusable[0]);

    const backward = pressKey(focusable[0], 'Tab', { shiftKey: true });
    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    await render(mount(onClose));
    pressKey(document.activeElement ?? dialog(), 'Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('focus return', () => {
  it('gives focus back to the opener when a dialog closes', async () => {
    await render(<AboutDialog onClose={() => undefined} returnFocus={opener} />);
    expect(document.activeElement).not.toBe(opener);
    act(() => root.render(<></>));
    expect(document.activeElement).toBe(opener);
  });
});
