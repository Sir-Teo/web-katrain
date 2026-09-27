import type { KataGoBackendPreference } from '../types';
import { isSmallKataGoModel } from '../engine/katago/modelDefaults';

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface EngineActivityPresentationArgs {
  status: EngineStatus;
  error?: string | null;
  isAiThinking: boolean;
  isGameAnalysisRunning: boolean;
  isContinuousAnalysis: boolean;
  isAnalysisMode: boolean;
  /** The backend the worker reported; null until a model has actually loaded. */
  activeBackend: string | null | undefined;
  modelUrl?: string | null;
  modelName?: string | null;
}

export interface EngineActivityPresentation {
  state: 'configured' | 'loading' | 'running' | 'ready' | 'error';
  label: string;
}

export function getEngineActivityPresentation(
  args: EngineActivityPresentationArgs,
): EngineActivityPresentation {
  if (args.error) return { state: 'error', label: 'Engine error' };
  if (args.status === 'loading') return { state: 'loading', label: ENGINE_LOADING_LABEL };
  if (args.isAiThinking) return { state: 'running', label: 'AI thinking…' };
  if (args.isGameAnalysisRunning || args.isContinuousAnalysis) {
    return { state: 'running', label: 'Analyzing…' };
  }
  // Nothing has loaded yet: the model is only chosen, so "ready" would be a
  // promise the first analysis might not keep.
  if (args.status !== 'ready' && !args.activeBackend?.trim()) {
    return { state: 'configured', label: args.isAnalysisMode ? 'Analysis mode' : 'Model not loaded' };
  }
  if (args.isAnalysisMode) return { state: 'ready', label: 'Analysis mode' };
  return { state: 'ready', label: isSmallKataGoModel(args.modelUrl, args.modelName) ? 'Test model ready' : 'KataGo ready' };
}

/**
 * What the engine's loading state is called wherever there is room for a
 * sentence. `stateLabel` below stays the bare word because it is set beside the
 * backend name in a status chip ("Loading · WebGPU"); these are the surfaces
 * that spell it out. Three wordings were in use, and the header pill's "Loading
 * model" and the note panel's "Loading engine..." were on screen together.
 *
 * "Model", not "engine": the state means the net is not resident yet, not that
 * a request is in flight — see the note beside `engineStatus: 'loading'` in
 * gameStore.
 */
export const ENGINE_LOADING_LABEL = 'Loading model';

export interface EngineStatusSummaryArgs {
  status: EngineStatus;
  error?: string | null;
  requestedBackend: KataGoBackendPreference | string;
  activeBackend?: string | null;
  modelLabel?: string | null;
  modelUrl?: string | null;
  /** Why the engine is not on the requested backend, from the worker. */
  backendNote?: string | null;
}

export interface EngineStatusSummary {
  stateLabel: string;
  /** The backend the worker reported, or "Not loaded" before it has reported one. */
  activeBackendLabel: string;
  /**
   * What to show beside the state word: the active backend once the worker has
   * confirmed it, otherwise the requested one marked as such.
   */
  backendDisplayLabel: string;
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
  isConfigured: boolean;
  backendNote?: string | null;
}): string {
  const hasLoadedBackend = !!args.activeBackend?.trim();
  if (args.error) {
    if (args.isFallback) return `${args.requestedBackendLabel} failed; ${args.activeBackendLabel} is the active fallback.`;
    return `${hasLoadedBackend ? args.activeBackendLabel : args.requestedBackendLabel} failed to start.`;
  }

  if (args.status === 'loading') {
    return `Loading ${hasLoadedBackend ? args.activeBackendLabel : args.requestedBackendLabel} analysis.`;
  }

  if (args.isConfigured) {
    return `The model loads on ${args.requestedBackendLabel} when analysis first runs.`;
  }

  if (args.isFallback) {
    return args.backendNote
      ? `${args.backendNote}.`
      : `${args.requestedBackendLabel} was requested; ${args.activeBackendLabel} is running.`;
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
  // Only the worker reports a backend, and only once a model is resident on
  // it; the store clears it whenever the model or backend setting changes. So
  // a reported backend is the one sign the engine is really up. A configured
  // model is not: it used to be enough for "Ready", and the requested backend
  // stood in for the active one, both before anything had loaded.
  const hasLoadedBackend = !!args.activeBackend?.trim();
  const hasConfiguredModel = !!args.modelLabel?.trim();
  const readyWhileIdle = args.status === 'idle' && hasLoadedBackend;
  const isConfigured = !args.error && args.status === 'idle' && !hasLoadedBackend && hasConfiguredModel;
  const stateLabel = args.error
    ? 'Error'
    : args.status === 'loading'
      ? 'Loading'
      : args.status === 'ready' || readyWhileIdle
        ? 'Ready'
        : isConfigured
          ? 'Configured'
          : 'Idle';
  const activeBackendLabel = formatEngineBackendLabel(hasLoadedBackend ? args.activeBackend : null);
  const requestedBackendLabel = formatEngineBackendLabel(args.requestedBackend);
  const backendDisplayLabel = hasLoadedBackend ? activeBackendLabel : `${requestedBackendLabel} requested`;
  const isFallback = hasLoadedBackend && args.activeBackend !== args.requestedBackend;
  const stateDisplay = isFallback ? `${stateLabel} fallback` : stateLabel;
  // Model names are long developer detail (often a training-run hash); the
  // compact label stays at state · backend and the title carries the model.
  const parts = [stateDisplay, backendDisplayLabel];
  const modelSource = getEngineModelSource(args.modelUrl);
  const isReady = stateLabel === 'Ready';
  const reasonLabel = getEngineBackendReason({
    status: args.status,
    error: args.error,
    requestedBackendLabel,
    activeBackendLabel,
    activeBackend: args.activeBackend,
    isFallback,
    isConfigured,
    backendNote: args.backendNote,
  });
  const titleLines = [
    `State: ${stateLabel}`,
    readyWhileIdle ? 'Activity: Idle' : '',
    `Backend: ${activeBackendLabel}`,
    isFallback || !hasLoadedBackend ? `Requested: ${requestedBackendLabel}` : '',
    args.modelLabel ? `Model: ${args.modelLabel}` : '',
    isSmallKataGoModel(args.modelUrl, args.modelLabel) ? 'Lightweight test model. Choose stronger weights in Settings → AI for serious review.' : '',
    `Source: ${modelSource}`,
    reasonLabel ? `Reason: ${reasonLabel}` : '',
    args.error ? `Error: ${args.error}` : '',
  ].filter(Boolean);

  return {
    stateLabel,
    activeBackendLabel,
    backendDisplayLabel,
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
