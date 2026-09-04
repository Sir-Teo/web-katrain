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
    <span className="w-16 shrink-0 text-[0.625rem] uppercase tracking-wide text-[var(--ui-text-faint)]">{label}</span>
    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--ui-surface-2)]">
      <span
        className="block h-full rounded-full bg-[var(--ui-accent)]"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </span>
  </div>
);

export const BotPersonaPicker: React.FC<BotPersonaPickerProps> = ({ selectedId, onSelect }) => {
  /**
   * Weakest first. The list was in declaration order, which ran 15k, 7k, 1d,
   * then 9d -- so the strongest bot in the app sat fourth, and 3k bots came
   * after 3d ones. Someone choosing an opponent is scanning for a rank near
   * their own, and that only works if the ranks are in order.
   *
   * The sort is stable, so bots that share a rank keep the order they are
   * declared in.
   */
  const ordered = React.useMemo(
    () => [...BOT_PERSONAS].sort((a, b) => b.rankKyu - a.rankKyu),
    []
  );
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Choose a bot">
      {ordered.map((persona) => {
        const active = persona.id === selectedId;
        const styleLabel = persona.styleTags.join(' · ');
        return (
          <button
            key={persona.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(persona)}
            className={[
              'min-h-16 rounded-lg border p-2 text-left transition-colors',
              active
                ? 'col-span-2 border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] p-3'
                : 'border-[var(--ui-border)] bg-[var(--ui-surface)] hover:bg-[var(--ui-surface-2)]',
            ].join(' ')}
          >
            <div className="flex min-w-0 items-baseline justify-between gap-2">
              <span className="truncate font-semibold text-[var(--ui-text)]">{persona.name}</span>
              <span className="shrink-0 rounded-full border border-[var(--ui-border)] px-2 py-0.5 font-mono text-[0.6875rem] text-[var(--ui-text-muted)]">
                {formatKyuRank(persona.rankKyu)}
              </span>
            </div>
            <div
              className="mt-1 truncate text-[0.625rem] uppercase tracking-wide text-[var(--ui-text-muted)]"
              title={styleLabel}
            >
              {styleLabel}
            </div>
            {active && (
              <>
                <p className="mt-2 text-xs leading-5 text-[var(--ui-text-muted)]">{persona.blurb}</p>
                <div className="mt-2 grid gap-1">
                  {TRAIT_LABELS.map(({ key, label }) => (
                    <TraitBar key={key} label={label} value={persona.traits[key]} />
                  ))}
                </div>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
};
