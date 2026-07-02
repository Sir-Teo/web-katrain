import React from 'react';
import { BOT_PERSONAS, type BotPersona, type BotPersonaTraits } from '../data/botPersonas';
import { formatKyuRank } from '../utils/tournament';

interface BotPersonaPickerProps {
  selectedId: string | null;
  onSelect: (persona: BotPersona) => void;
}

const TRAIT_LABELS: Array<{ key: keyof BotPersonaTraits; label: string }> = [
  { key: 'reading', label: 'Reading' },
  { key: 'fighting', label: 'Fighting' },
  { key: 'territory', label: 'Territory' },
  { key: 'risk', label: 'Risk' },
];

const TraitBar: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="flex items-center gap-2">
    <span className="w-16 shrink-0 text-[10px] uppercase tracking-wide text-[var(--ui-text-faint)]">{label}</span>
    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--ui-surface-2)]">
      <span
        className="block h-full rounded-full bg-[var(--ui-accent)]"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </span>
  </div>
);

export const BotPersonaPicker: React.FC<BotPersonaPickerProps> = ({ selectedId, onSelect }) => {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Choose a bot">
      {BOT_PERSONAS.map((persona) => {
        const active = persona.id === selectedId;
        return (
          <button
            key={persona.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(persona)}
            className={[
              'flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors',
              active
                ? 'border-[var(--ui-accent)] bg-[var(--ui-accent-soft)]'
                : 'border-[var(--ui-border)] bg-[var(--ui-surface)] hover:bg-[var(--ui-surface-2)]',
            ].join(' ')}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold text-[var(--ui-text)]">{persona.name}</span>
              <span className="shrink-0 rounded-full border border-[var(--ui-border)] px-2 py-0.5 font-mono text-[11px] text-[var(--ui-text-muted)]">
                {formatKyuRank(persona.rankKyu)}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {persona.styleTags.map((tag) => (
                <span key={tag} className="rounded-full bg-[var(--ui-surface-2)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--ui-text-muted)]">
                  {tag}
                </span>
              ))}
            </div>
            <p className="text-xs text-[var(--ui-text-muted)]">{persona.blurb}</p>
            <div className="mt-1 grid gap-1">
              {TRAIT_LABELS.map(({ key, label }) => (
                <TraitBar key={key} label={label} value={persona.traits[key]} />
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
};
