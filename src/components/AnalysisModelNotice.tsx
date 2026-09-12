import { isSmallKataGoModel } from '../engine/katago/modelDefaults';

export function AnalysisModelNotice({ modelUrl, modelName, onChooseModel }: {
  modelUrl: string;
  modelName?: string | null;
  onChooseModel?: () => void;
}) {
  if (!isSmallKataGoModel(modelUrl, modelName)) return null;
  return (
    <div className="rounded-md border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 text-xs leading-relaxed text-[var(--ui-text-muted)]" data-analysis-model-notice="true">
      <p className="font-semibold text-[var(--ui-text)]">Lightweight test model selected</p>
      <p className="mt-1">Useful for trying the app. Choose stronger weights for serious game review; more visits alone cannot replace a stronger model.</p>
      {onChooseModel && (
        <button type="button" className="mt-2 min-h-11 rounded-md border border-[var(--ui-border)] px-3 font-semibold text-[var(--ui-accent)] hover:bg-[var(--ui-accent-soft)]" onClick={onChooseModel}>
          Choose model
        </button>
      )}
    </div>
  );
}
