import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Icon } from '../src/components/dashboard/icons';

/** The element `Icon` would hand React for a given name. */
const elementFor = (name: Parameters<typeof Icon>[0]['name']) =>
  Icon({ name }) as unknown as { props: { dangerouslySetInnerHTML: { __html: string } } };

describe('dashboard icon markup', () => {
  it('hands React the same object every render', () => {
    // React compares dangerouslySetInnerHTML by identity, so a fresh
    // `{ __html }` literal per render rewrote the <svg>'s innerHTML and threw
    // away its shapes on every re-render. Measured on the desktop shell with a
    // MutationObserver: placing six stones cost 946 DOM mutations, 544 of them
    // SVG children being destroyed and recreated. Making the object stable
    // took that to 414 and 13.
    const first = elementFor('plus').props.dangerouslySetInnerHTML;
    const second = elementFor('plus').props.dangerouslySetInnerHTML;

    expect(second).toBe(first);
  });

  it('still gives each icon its own markup', () => {
    expect(elementFor('plus').props.dangerouslySetInnerHTML.__html)
      .not.toBe(elementFor('folder').props.dangerouslySetInnerHTML.__html);
    expect(elementFor('plus').props.dangerouslySetInnerHTML.__html).toContain('<path');
  });

  it('renders shapes for every name it knows', () => {
    const source = readFileSync('src/components/dashboard/icons.tsx', 'utf8');
    const names = [...source.matchAll(/^ {2}([a-zA-Z]+):\s*$|^ {2}([a-zA-Z]+): '/gm)]
      .map((match) => (match[1] ?? match[2])!)
      .filter(Boolean);

    expect(names.length).toBeGreaterThanOrEqual(25);

    for (const name of names) {
      const html = renderToStaticMarkup(<Icon name={name as Parameters<typeof Icon>[0]['name']} />);
      expect(html, `${name} rendered no shape`).toMatch(/<(path|circle|rect|line|polygon)\b/);
    }
  });

  it('builds the markup once, not per render', () => {
    // The literal is what regressed; a guard on the shape of the fix.
    const source = readFileSync('src/components/dashboard/icons.tsx', 'utf8');

    expect(source).not.toMatch(/dangerouslySetInnerHTML=\{\{/);
  });
});
