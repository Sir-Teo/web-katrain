import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { beginClipboardWriteRequest, copyTextToClipboard, isClipboardWriteRequestCurrent } from '../utils/clipboard';
import { formatEngineErrorReport, type EngineDiagnosticInput } from '../utils/engineDiagnostics';
import { useGameStore } from '../store/gameStore';

/** Copy feedback belongs to the displayed report and the latest copy action. */
export function useEngineErrorCopy(input: Omit<EngineDiagnosticInput, 'error'> & { error: string | null }) {
  const { status, requestedBackend, activeBackend, modelLabel, modelUrl, error } = input;
  const report = useMemo(() => error ? formatEngineErrorReport({
    status, requestedBackend, activeBackend, modelLabel, modelUrl, error,
  }) : null, [status, requestedBackend, activeBackend, modelLabel, modelUrl, error]);
  const [copiedReport, setCopiedReport] = useState<string | null>(null);
  const currentReport = useRef(report);

  useLayoutEffect(() => {
    currentReport.current = report;
    return () => { currentReport.current = null; };
  }, [report]);

  const copy = useCallback(async () => {
    if (!report) return;
    const request = beginClipboardWriteRequest();
    const ok = await copyTextToClipboard(report, undefined, undefined, request);
    if (!isClipboardWriteRequestCurrent(request) || currentReport.current !== report) return;
    setCopiedReport(ok ? report : null);
    useGameStore.setState({ notification: {
      message: ok ? 'Copied engine error details.' : 'Could not copy engine error details.',
      type: ok ? 'success' : 'error',
      operationId: 'engine-error-copy',
    } });
  }, [report]);

  return { copied: report !== null && copiedReport === report, copy };
}
