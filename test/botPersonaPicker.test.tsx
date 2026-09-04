import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BotPersonaPicker } from '../src/components/BotPersonaPicker';
import { BOT_PERSONAS } from '../src/data/botPersonas';
import { formatKyuRank } from '../src/utils/tournament';

describe('BotPersonaPicker', () => {
  it('starts as a compact two-column roster', () => {
    const html = renderToStaticMarkup(<BotPersonaPicker selectedId={null} onSelect={() => undefined} />);

    expect(html).toContain('grid grid-cols-2 gap-2');
    expect(html.match(/role="radio"/g)).toHaveLength(10);
    expect(html).toContain('Gentle · Balanced');
    expect(html).not.toContain('A patient beginner.');
    expect(html).not.toContain('>Reading</span>');
  });

  it('expands only the selected bot with its decision-making detail', () => {
    const html = renderToStaticMarkup(<BotPersonaPicker selectedId="pebble" onSelect={() => undefined} />);

    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('col-span-2');
    expect(html).toContain('A patient beginner.');
    expect(html).toContain('>Reading</span>');
    expect(html).not.toContain('Solid single-digit kyu.');
  });

  it('lists the bots weakest first, whatever order they are declared in', () => {
    const html = renderToStaticMarkup(<BotPersonaPicker selectedId={null} onSelect={() => undefined} />);
    const shown = [...html.matchAll(/font-mono[^>]*>([^<]+)</g)].map((match) => match[1]!.trim());
    const expected = [...BOT_PERSONAS]
      .sort((a, b) => b.rankKyu - a.rankKyu)
      .map((persona) => formatKyuRank(persona.rankKyu));

    expect(shown).toEqual(expected);
    // Declaration order ran 15k, 7k, 1d, 9d, so the strongest bot in the app
    // sat fourth. Someone picking an opponent scans for a rank near their own.
    expect(shown).not.toEqual(BOT_PERSONAS.map((persona) => formatKyuRank(persona.rankKyu)));
  });

  it('sorts stably, so bots sharing a rank keep their declared order', () => {
    const source = readFileSync('src/components/BotPersonaPicker.tsx', 'utf8');
    expect(source).toContain('[...BOT_PERSONAS].sort((a, b) => b.rankKyu - a.rankKyu)');
    const shared = BOT_PERSONAS.filter(
      (persona, _, all) => all.filter((other) => other.rankKyu === persona.rankKyu).length > 1
    );
    expect(shared.length, 'the stability guarantee only means something with a shared rank').toBeGreaterThan(1);
  });
});
