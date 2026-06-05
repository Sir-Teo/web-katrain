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
  reasonLabel: string;
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

function isBundledModelPath(modelUrl: string): boolean {
  const cleanUrl = modelUrl.split('#')[0]?.split('?')[0] ?? modelUrl;
  const segments = cleanUrl.split('/').filter(Boolean);
  const startsWithModels = segments[0] === 'models';
  const hasSingleBaseBeforeModels = segments.length >= 3 && segments[1] === 'models';

  if (startsWithModels) return true;
  if (!hasSingleBaseBeforeModels) return false;

  // Avoid misclassifying common filesystem-style paths as app-public assets.
  return !['Users', 'home', 'Volumes', 'tmp', 'var', 'opt'].includes(segments[0]!);
}

export function getEngineModelSource(modelUrl: string | null | undefined): string {
  const rawUrl = modelUrl?.trim();
  if (!rawUrl) return 'Unknown';
  if (rawUrl.startsWith('blob:')) return 'Uploaded';
  if (/^https?:\/\//i.test(rawUrl)) return 'Remote';
  if (/^file:/i.test(rawUrl)) return 'Local';
  if (isBundledModelPath(rawUrl)) return 'Bundled';
  return 'Local';
}

function getEngineBackendReason(args: {
  status: EngineStatus;
  error?: string | null;
  requestedBackendLabel: string;
  activeBackendLabel: string;
  activeBackend?: string | null;
  isFallback: boolean;
}): string {
  if (args.error) {
    return args.isFallback
      ? `${args.requestedBackendLabel} failed; ${args.activeBackendLabel} is the active fallback.`
      : `${args.activeBackendLabel} failed to start.`;
  }

  if (args.status === 'loading') {
    return `Loading ${args.activeBackendLabel} analysis.`;
  }

  if (args.isFallback) {
    return `${args.requestedBackendLabel} was requested; ${args.activeBackendLabel} is running.`;
  }

  const normalized = args.activeBackend?.trim().toLowerCase();
  if (normalized === 'webgpu' || normalized === 'webgpu-gc') {
    return 'Browser GPU acceleration is active.';
  }
  if (normalized === 'wasm') {
    return 'Compatible CPU analysis path; slower than WebGPU but broadly supported.';
  }
  if (normalized === 'cpu') {
    return 'Plain CPU analysis path selected for maximum compatibility.';
  }
  if (!normalized) {
    return 'Analysis engine will start when analysis runs.';
  }
  return `${args.activeBackendLabel} analysis path is active.`;
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
  const reasonLabel = getEngineBackendReason({
    status: args.status,
    error: args.error,
    requestedBackendLabel,
    activeBackendLabel,
    activeBackend: args.activeBackend,
    isFallback,
  });
  const titleLines = [
    `State: ${stateLabel}`,
    reportsReadyWhileIdle ? 'Activity: Idle' : '',
    `Backend: ${activeBackendLabel}`,
    isFallback ? `Requested: ${requestedBackendLabel}` : '',
    args.modelLabel ? `Model: ${args.modelLabel}` : '',
    `Source: ${modelSource}`,
    reasonLabel ? `Reason: ${reasonLabel}` : '',
    args.error ? `Error: ${args.error}` : '',
  ].filter(Boolean);

  return {
    stateLabel,
    activeBackendLabel,
    requestedBackendLabel,
    modelSource,
    isFallback,
    reasonLabel,
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
