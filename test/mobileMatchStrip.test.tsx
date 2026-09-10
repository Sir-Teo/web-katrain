import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MobileMatchStrip } from '../src/components/layout/MobileMatchStrip';

const baseProps = {
  currentPlayer: 'black' as const,
  blackName: 'Alice',
  whiteName: 'Bob',
  blackRank: '3d',
  whiteRank: '2d',
  capturedBlack: 0,
  capturedWhite: 2,
  boardSize: 19,
  komi: 6.5,
  handicap: 0,
};

describe('MobileMatchStrip', () => {
  it('shows who is to move, with names, ranks and captures', () => {
    const html = renderToStaticMarkup(<MobileMatchStrip {...baseProps} />);

    expect(html).toContain('data-mobile-match-strip="true"');
    expect(html).toContain('data-to-move="true"');
    expect(html).toContain('Alice');
    expect(html).toContain('Bob');
    expect(html).toContain('3d');
    // Black's captures are the white stones it took.
    expect(html).toContain('+2');
    expect(html).toContain('<span class="sr-only"> captured</span>');
    expect(html).toContain('<span class="sr-only">to move</span>');
  });

  it('says komi out loud and leaves the repeated facts decorative', () => {
    // Board size and handicap are read out by the bottom control bar, so a
    // second copy here would say them twice. Komi is nowhere else in the mobile
    // shell, so hiding it left a fact the desktop game strip announces with no
    // spoken equivalent on a phone.
    const html = renderToStaticMarkup(<MobileMatchStrip {...baseProps} handicap={4} />);

    expect(html).toContain('<span class="mobile-match-fact" aria-hidden="true">19×19</span>');
    expect(html).toContain('<span class="mobile-match-fact" aria-hidden="true">H4</span>');
    expect(html).toContain('<span class="mobile-match-fact">komi 6.5</span>');
    expect(html).not.toContain('class="mobile-match-facts" aria-hidden');
  });

  it('falls back to the colours when a game carries no names', () => {
    const html = renderToStaticMarkup(
      <MobileMatchStrip {...baseProps} blackName="" whiteName="" blackRank="" whiteRank="" />,
    );

    expect(html).toContain('Black');
    expect(html).toContain('White');
  });
});
