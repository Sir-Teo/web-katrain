import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StaticBoard } from '../src/components/StaticBoard';
import type { BoardState } from '../src/types';

const empty = (size: number): BoardState =>
  Array.from({ length: size }, () => Array.from({ length: size }, () => null));

const noop = () => undefined;

/**
 * Tsumego, guess-the-move and the lessons all answer by picking a point on this
 * board, and all three were mouse-only: the click layer is a transparent
 * `<circle>` per intersection with nothing but `onClick` on it. The main board
 * has had a keyboard cursor for a while; these had no way in at all.
 */
describe('StaticBoard keyboard access', () => {
  it('is focusable and says how to drive it when a point can be picked', () => {
    const html = renderToStaticMarkup(
      <StaticBoard board={empty(9)} ariaLabel="Problem position" onPointClick={noop} />
    );

    expect(html).toContain('tabindex="0"');
    expect(html).toContain('role="application"');
    expect(html).toContain('Arrow keys move the cursor, Enter plays it.');
    expect(html).toContain('data-static-board-interactive="true"');
  });

  it('stays an inert image when there is nothing to pick', () => {
    const html = renderToStaticMarkup(
      <StaticBoard board={empty(9)} ariaLabel="Final position preview" />
    );

    // A preview that takes focus is a tab stop that leads nowhere.
    expect(html).not.toContain('tabindex');
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Final position preview"');
    expect(html).not.toContain('Arrow keys');
  });

  it('draws no cursor until a key raises one', () => {
    const html = renderToStaticMarkup(
      <StaticBoard board={empty(9)} ariaLabel="Problem position" onPointClick={noop} />
    );
    // Focus alone must not draw it -- the same rule the main board follows.
    expect(html).not.toContain('data-static-board-cursor-ring');
    expect(html).not.toContain('data-static-board-cursor=');
  });
});
