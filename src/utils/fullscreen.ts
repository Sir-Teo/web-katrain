type WebKitDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenTarget = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

const maybeAwait = async (result: Promise<void> | void): Promise<void> => {
  if (result && typeof (result as Promise<void>).then === 'function') await result;
};

export function getFullscreenElement(doc: Document = document): Element | null {
  const webkitDoc = doc as WebKitDocument;
  return doc.fullscreenElement ?? webkitDoc.webkitFullscreenElement ?? null;
}

export function isFullscreenActive(doc: Document = document): boolean {
  return !!getFullscreenElement(doc);
}

export async function requestAppFullscreen(
  element: HTMLElement = document.documentElement
): Promise<void> {
  const target = element as FullscreenTarget;
  const request = target.requestFullscreen?.bind(target) ?? target.webkitRequestFullscreen?.bind(target);
  if (!request) return;
  await maybeAwait(request());
}

export async function exitAppFullscreen(doc: Document = document): Promise<void> {
  const webkitDoc = doc as WebKitDocument;
  const exit = doc.exitFullscreen?.bind(doc) ?? webkitDoc.webkitExitFullscreen?.bind(doc);
  if (!exit) return;
  await maybeAwait(exit());
}

export async function toggleAppFullscreen(doc: Document = document): Promise<void> {
  if (isFullscreenActive(doc)) {
    await exitAppFullscreen(doc);
  } else {
    await requestAppFullscreen(doc.documentElement);
  }
}

export function subscribeFullscreenChange(
  handler: () => void,
  doc: Document = document
): () => void {
  doc.addEventListener('fullscreenchange', handler);
  doc.addEventListener('webkitfullscreenchange', handler as EventListener);
  return () => {
    doc.removeEventListener('fullscreenchange', handler);
    doc.removeEventListener('webkitfullscreenchange', handler as EventListener);
  };
}
