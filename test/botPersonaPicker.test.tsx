import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BotPersonaPicker } from '../src/components/BotPersonaPicker';

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
});
