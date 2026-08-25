import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const registry = () => {
  const source = readFileSync('src/components/Layout.tsx', 'utf8');
  const start = source.indexOf('const commandPaletteCommands: CommandPaletteCommand[] =');
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('\n  const ', source.indexOf('\n  })();', start));
  const text = source.slice(start, end);
  // Guard the slice: an empty region would satisfy the presence checks vacuously
  // only if they were negative, but it would fail loudly here instead.
  expect(text.length).toBeGreaterThan(1000);
  return text;
};

describe('command palette game actions', () => {
  it.each([
    ["id: 'pass'", 'Pass'],
    ["id: 'ai-move'", 'AI move'],
    ["id: 'rotate-board'", 'Rotate board'],
    ["id: 'resign'", 'Resign'],
  ])('registers %s', (id, label) => {
    const text = registry();

    expect(text).toContain(id);
    expect(text).toContain(`label: '${label}'`);
  });

  it('calls resign lazily because it is declared after the registry', () => {
    // handleResign is a const below this list, so naming it directly threw a
    // temporal-dead-zone error while the list was built.
    expect(registry()).toContain('run: () => handleResign()');
  });
});
