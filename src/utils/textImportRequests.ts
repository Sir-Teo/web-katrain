export interface TextImportRequest {
  readonly signal: AbortSignal;
  readonly rootId: string;
}

/** Own a text import from clipboard read through download and confirmation. */
export function createTextImportRequests(readRootId: () => string) {
  let current: {
    request: TextImportRequest;
    controller: AbortController;
    unlink: () => void;
  } | null = null;

  const cancel = () => {
    const previous = current;
    current = null;
    previous?.unlink();
    previous?.controller.abort();
  };

  return {
    begin(externalSignal?: AbortSignal): TextImportRequest {
      cancel();
      const controller = new AbortController();
      const onAbort = () => controller.abort(externalSignal?.reason);
      const request = { signal: controller.signal, rootId: readRootId() };
      current = {
        request,
        controller,
        unlink: () => externalSignal?.removeEventListener('abort', onAbort),
      };
      if (externalSignal?.aborted) onAbort();
      else externalSignal?.addEventListener('abort', onAbort, { once: true });
      return request;
    },
    isCurrent(request: TextImportRequest): boolean {
      return current?.request === request && !request.signal.aborted;
    },
    finish(request: TextImportRequest) {
      if (current?.request !== request) return;
      current.unlink();
      current = null;
    },
    cancel,
  };
}
