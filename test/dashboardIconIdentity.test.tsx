import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ICON_NAMES, Icon, type IconName } from '../src/components/dashboard/icons';

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
    // Walks the real keys rather than a regex over the source, which could
    // miss a name and still pass.
    expect(ICON_NAMES.length).toBeGreaterThanOrEqual(25);

    for (const name of ICON_NAMES) {
      const html = renderToStaticMarkup(<Icon name={name} />);
      expect(html, `${name} rendered no shape`).toMatch(/<(path|circle|rect|line|polygon)\b/);
    }
  });

  it('checks icon names at compile time', () => {
    const known: IconName = 'copy';
    expect(ICON_NAMES).toContain(known);

    // PATHS was annotated `Record<string, string>`, which made IconName resolve
    // to `string`: every name type-checked, and one with no path rendered an
    // empty <svg> that nothing complained about. If the annotation comes back,
    // this directive stops being needed and tsc fails on the unused suppression.
    // @ts-expect-error IconName must be the union of real names, never string.
    const unknown: IconName = 'definitely-not-an-icon';
    expect(ICON_NAMES).not.toContain(unknown);
  });

  it('builds the markup once, not per render', () => {
    // The literal is what regressed; a guard on the shape of the fix.
    const source = readFileSync('src/components/dashboard/icons.tsx', 'utf8');

    expect(source).not.toMatch(/dangerouslySetInnerHTML=\{\{/);
  });
});
