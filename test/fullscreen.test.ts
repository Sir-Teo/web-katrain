import { describe, expect, it, vi } from 'vitest';
import {
  getFullscreenElement,
  isFullscreenActive,
  requestAppFullscreen,
  exitAppFullscreen,
  subscribeFullscreenChange,
  toggleAppFullscreen,
} from '../src/utils/fullscreen';

type FakeDocument = Document & {
  fullscreenElement: Element | null;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};

type FakeElement = HTMLElement & {
  webkitRequestFullscreen?: () => void;
};

function fakeDocument(args: {
  fullscreenElement?: Element | null;
  webkitFullscreenElement?: Element | null;
  documentElement?: HTMLElement;
  exitFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  addEventListener?: (event: string, handler: EventListenerOrEventListenerObject) => void;
  removeEventListener?: (event: string, handler: EventListenerOrEventListenerObject) => void;
} = {}): FakeDocument {
  return {
    fullscreenElement: args.fullscreenElement ?? null,
    webkitFullscreenElement: args.webkitFullscreenElement ?? null,
    documentElement: args.documentElement ?? ({} as HTMLElement),
    exitFullscreen: args.exitFullscreen,
    webkitExitFullscreen: args.webkitExitFullscreen,
    addEventListener: args.addEventListener ?? vi.fn(),
    removeEventListener: args.removeEventListener ?? vi.fn(),
  } as unknown as FakeDocument;
}

describe('fullscreen utilities', () => {
  it('detects standard and WebKit fullscreen elements', () => {
    const standardEl = {} as Element;
    const webkitEl = {} as Element;

    expect(getFullscreenElement(fakeDocument({ fullscreenElement: standardEl }))).toBe(standardEl);
    expect(getFullscreenElement(fakeDocument({ webkitFullscreenElement: webkitEl }))).toBe(webkitEl);
    expect(isFullscreenActive(fakeDocument({ webkitFullscreenElement: webkitEl }))).toBe(true);
    expect(isFullscreenActive(fakeDocument())).toBe(false);
  });

  it('requests fullscreen through standard or WebKit APIs', async () => {
    const standardRequest = vi.fn();
    const webkitRequest = vi.fn();

    await requestAppFullscreen({ requestFullscreen: standardRequest } as unknown as HTMLElement);
    await requestAppFullscreen({ webkitRequestFullscreen: webkitRequest } as unknown as FakeElement);

    expect(standardRequest).toHaveBeenCalledTimes(1);
    expect(webkitRequest).toHaveBeenCalledTimes(1);
  });

  it('exits fullscreen through standard or WebKit APIs', async () => {
    const standardExit = vi.fn();
    const webkitExit = vi.fn();

    await exitAppFullscreen(fakeDocument({ exitFullscreen: standardExit }));
    await exitAppFullscreen(fakeDocument({ webkitExitFullscreen: webkitExit }));

    expect(standardExit).toHaveBeenCalledTimes(1);
    expect(webkitExit).toHaveBeenCalledTimes(1);
  });

  it('toggles fullscreen using the active API family', async () => {
    const request = vi.fn();
    const exit = vi.fn();
    const element = { webkitRequestFullscreen: request } as unknown as HTMLElement;
    const inactiveDoc = fakeDocument({ documentElement: element });
    const activeDoc = fakeDocument({ webkitFullscreenElement: element, webkitExitFullscreen: exit });

    await toggleAppFullscreen(inactiveDoc);
    await toggleAppFullscreen(activeDoc);

    expect(request).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('subscribes to standard and WebKit fullscreen changes', () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const doc = fakeDocument({ addEventListener, removeEventListener });
    const handler = vi.fn();

    const unsubscribe = subscribeFullscreenChange(handler, doc);
    unsubscribe();

    expect(addEventListener).toHaveBeenCalledWith('fullscreenchange', handler);
    expect(addEventListener).toHaveBeenCalledWith('webkitfullscreenchange', handler);
    expect(removeEventListener).toHaveBeenCalledWith('fullscreenchange', handler);
    expect(removeEventListener).toHaveBeenCalledWith('webkitfullscreenchange', handler);
  });
});
