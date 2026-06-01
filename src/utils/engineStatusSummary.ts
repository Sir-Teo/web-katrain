import type { KataGoBackendPreference } from '../types';

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface EngineStatusSummaryArgs {
  status: EngineStatus;
  error?: string | null;
  requestedBackend: KataGoBackendPreference | string;
  activeBackend?: string | null;
  modelLabel?: string | null;
  modelUrl?: string | null;
}

export interface EngineStatusSummary {
  stateLabel: string;
  activeBackendLabel: string;
  requestedBackendLabel: string;
  modelSource: string;
  isFallback: boolean;
  compactLabel: string;
  title: string;
  dotClass: string;
  tone: 'default' | 'error';
}

export function formatEngineBackendLabel(backend: string | null | undefined): string {
  const normalized = backend?.trim().toLowerCase();
  switch (normalized) {
    case 'webgpu':
      return 'WebGPU';
    case 'webgpu-gc':
      return 'WebGPU GC';
    case 'wasm':
      return 'CPU (WASM)';
    case 'cpu':
      return 'CPU';
    case 'tensorflow':
    case 'tfjs':
      return 'TensorFlow.js';
    case 'webnn':
      return 'WebNN';
    case 'native':
    case 'native-gpu':
      return 'Native GPU';
    case 'native-cpu':
      return 'Native CPU';
    case 'pytorch':
      return 'PyTorch';
    case '':
    case undefined:
      return 'Not loaded';
    default:
      return backend ?? 'Not loaded';
  }
}

export function getEngineModelSource(modelUrl: string | null | undefined): string {
  const rawUrl = modelUrl?.trim();
  if (!rawUrl) return 'Unknown';
  if (rawUrl.startsWith('blob:')) return 'Uploaded';
  if (rawUrl.startsWith('/models/') || rawUrl.startsWith('models/')) return 'Bundled';
  if (/^https?:\/\//i.test(rawUrl)) return 'Remote';
  return 'Local';
}

export function getEngineStatusSummary(args: EngineStatusSummaryArgs): EngineStatusSummary {
  const hasLoadedBackend = !!args.activeBackend?.trim();
  const hasConfiguredModel = !!args.modelLabel?.trim();
  const reportsReadyWhileIdle = args.status === 'idle' && (hasLoadedBackend || hasConfiguredModel);
  const stateLabel = args.error
    ? 'Error'
    : args.status === 'loading'
      ? 'Loading'
      : args.status === 'ready' || reportsReadyWhileIdle
        ? 'Ready'
        : 'Idle';
  const activeBackend = args.activeBackend ?? args.requestedBackend;
  const activeBackendLabel = formatEngineBackendLabel(activeBackend);
  const requestedBackendLabel = formatEngineBackendLabel(args.requestedBackend);
  const isFallback = !!args.activeBackend && args.activeBackend !== args.requestedBackend;
  const stateDisplay = isFallback ? `${stateLabel} fallback` : stateLabel;
  const parts = [stateDisplay, activeBackendLabel];
  if (args.modelLabel) parts.push(args.modelLabel);
  const modelSource = getEngineModelSource(args.modelUrl);
  const isReady = stateLabel === 'Ready';
  const titleLines = [
    `State: ${stateLabel}`,
    reportsReadyWhileIdle ? 'Activity: Idle' : '',
    `Backend: ${activeBackendLabel}`,
    isFallback ? `Requested: ${requestedBackendLabel}` : '',
    args.modelLabel ? `Model: ${args.modelLabel}` : '',
    `Source: ${modelSource}`,
    args.error ? `Error: ${args.error}` : '',
  ].filter(Boolean);

  return {
    stateLabel,
    activeBackendLabel,
    requestedBackendLabel,
    modelSource,
    isFallback,
    compactLabel: parts.join(' · '),
    title: titleLines.join('\n'),
    dotClass: args.error
      ? 'bg-red-500'
      : args.status === 'loading'
        ? 'bg-yellow-400'
        : isReady
          ? 'bg-green-400'
          : 'bg-slate-500',
    tone: args.error ? 'error' : 'default',
  };
}
