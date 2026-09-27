import type { AnalysisProvenance, AnalysisResult, AnalysisSource } from '../types';
import { rulesLabel } from './goRules';

const SOURCE_LABELS: Record<AnalysisSource, string> = {
  local: 'This app (KataGo)',
  'imported-katrain': 'Imported from KaTrain',
  'imported-kaya': 'Imported from Kaya',
};

export const UNKNOWN_PROVENANCE_LABEL = 'Unknown provenance';

const modelFileName = (url: string): string => {
  const path = url.split(/[?#]/)[0] ?? url;
  const name = path.slice(path.lastIndexOf('/') + 1);
  return name || url;
};

/** The facts a provenance records, most important first, for a tooltip or a short line. */
export const describeAnalysisProvenance = (provenance: AnalysisProvenance | undefined): string[] => {
  if (!provenance) return [UNKNOWN_PROVENANCE_LABEL];
  const parts = [SOURCE_LABELS[provenance.source] ?? UNKNOWN_PROVENANCE_LABEL];
  const model = provenance.modelName || (provenance.modelUrl ? modelFileName(provenance.modelUrl) : '');
  if (model) parts.push(model);
  if (typeof provenance.visits === 'number' && provenance.visits > 0) parts.push(`${provenance.visits} visits`);
  const rules = provenance.rules ? rulesLabel(provenance.rules) : '';
  const komi = typeof provenance.komi === 'number' && Number.isFinite(provenance.komi) ? `komi ${provenance.komi}` : '';
  if (rules || komi) parts.push([rules, komi].filter(Boolean).join(', '));
  return parts;
};

export const formatAnalysisProvenance = (analysis: AnalysisResult | null | undefined): string | null =>
  analysis ? describeAnalysisProvenance(analysis.provenance).join(' · ') : null;
