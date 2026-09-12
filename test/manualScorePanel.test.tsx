import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { ManualScorePanel } from '../src/components/ManualScorePanel';
import { computeManualScoreEstimate, type ManualScoreEstimate } from '../src/utils/scoring';
import type { BoardState } from '../src/types';

const score: ManualScoreEstimate = {
  rules: 'japanese',
  points: {
    black: { territory: 2, prisoners: 2, deadStones: 0, livingStones: 0, komi: 0, handicapBonus: 0, groupTax: 0 },
    white: { territory: 2, prisoners: 1, deadStones: 1, livingStones: 0, komi: 6.5, handicapBonus: 0, groupTax: 0 },
  },
  territory: [
    [1, 0, -1],
    [1, 0, -1],
    [0, 0, 0],
  ],
  blackTerritory: 2,
  whiteTerritory: 2,
  neutralPoints: 5,
  blackDeadStones: 1,
  whiteDeadStones: 0,
  blackScore: 4,
  whiteScore: 10.5,
  scoreLead: -6.5,
  result: 'W+6.5',
};

const baseProps = {
  active: true,
  score,
  blackName: 'Black',
  whiteName: 'White',
  deadStoneCount: 1,
  onToggle: () => undefined,
  onClear: () => undefined,
  onDone: () => undefined,
};

const settledBoard: BoardState = [
  'XXXXOOOOO', 'X.XXO.O.O', 'XXXXOOOOO',
  'XXXXXXXXX', 'XXXXXXXXX', 'XXXXXXXXX',
  'XXXXOOOOO', 'X.XXO.O.O', 'XXXXOOOOO',
].map(row => Array.from(row, cell => cell === 'X' ? 'black' : cell === 'O' ? 'white' : null));
const countArgs = { board: settledBoard, capturedBlack: 3, capturedWhite: 5, komi: 7, deadStones: new Set<string>() };
const renderedRow = (html: string, label: string) => {
  const row = html.split(`<div><span>${label}</span>`)[1]?.split('</div>')[0];
  return row ? [...row.matchAll(/<b[^>]*>(.*?)<\/b>/g)].map(cell => cell[1]!.replace(/<[^>]*>/g, '')) : undefined;
};

describe('manual score contributions shown to the player', () => {
  it.each([
    ['japanese', 7, 14], ['korean', 7, 14],
    ['chinese', 51, 37], ['aga', 51, 37], ['new-zealand', 51, 37],
    ['tromp-taylor', 51, 37], ['stone-scoring', 49, 33],
  ] as const)('shows the counted contributions under %s', (rules, black, white) => {
    const result = computeManualScoreEstimate({ ...countArgs, rules });
    expect(result.blackScore).toBe(black);
    expect(result.whiteScore).toBe(white);
    expect(Object.values(result.points.black).reduce((a, b) => a + b, 0)).toBe(black);
    expect(Object.values(result.points.white).reduce((a, b) => a + b, 0)).toBe(white);
    const html = renderToStaticMarkup(<ManualScorePanel {...baseProps} score={result} />);
    expect(renderedRow(html, 'Territory')).toEqual(['Black 2', 'White 4']);
    expect(renderedRow(html, 'Komi')).toEqual(['-', 'White 7']);
    if (rules === 'japanese' || rules === 'korean') {
      expect(renderedRow(html, 'Prisoners')).toEqual(['Black 5', 'White 3']);
      expect(renderedRow(html, 'Living stones')).toBeUndefined();
      expect(html).toContain('Territory scoring');
    } else {
      expect(renderedRow(html, 'Living stones')).toEqual(['Black 49', 'White 26']);
      expect(renderedRow(html, 'Prisoners')).toBeUndefined();
      expect(renderedRow(html, 'Dead stones')).toBeUndefined();
      expect(html).toContain('Area scoring');
    }
    expect(renderedRow(html, 'Group tax')).toEqual(rules === 'stone-scoring' ? ['Black -2', 'White -4'] : undefined);
  });

  it.each([['chinese', 4], ['aga', 3], ['new-zealand', 0], ['japanese', 0]] as const)(
    'shows White’s handicap compensation under %s', (rules, bonus) => {
      const result = computeManualScoreEstimate({ ...countArgs, rules, handicapStones: 4 });
      const html = renderToStaticMarkup(<ManualScorePanel {...baseProps} score={result} />);
      expect(result.points.white.handicapBonus).toBe(bonus);
      expect(renderedRow(html, 'Handicap bonus')).toEqual(bonus > 0 ? ['-', `White ${bonus}`] : undefined);
    },
  );

  it('removes dead stones from area and group tax without adding them as prisoners', () => {
    const deadStones = new Set<string>();
    settledBoard.forEach((row, y) => row.forEach((stone, x) => { if (stone === 'black') deadStones.add(`${x},${y}`); }));
    const result = computeManualScoreEstimate({ ...countArgs, rules: 'stone-scoring', deadStones });
    expect(result.result).toBe('W+84.0'); // White owns 81, plus 7 komi, minus 4 group tax.
    expect(result.points.black.livingStones).toBe(0);
    expect(result.points.black.groupTax).toBe(0);
    expect(result.points.white.deadStones).toBe(0);
    expect(result.points.white.prisoners).toBe(0);
    const html = renderToStaticMarkup(<ManualScorePanel {...baseProps} score={result} deadStoneCount={49} />);
    expect(renderedRow(html, 'Group tax')).toEqual(['Black 0', 'White -4']);
    expect(renderedRow(html, 'Living stones')).toEqual(['Black 0', 'White 26']);
  });
});

describe('ManualScorePanel', () => {
  it('keeps compact expanded details scrollable without losing the actions', () => {
    const css = readFileSync('src/index.css', 'utf8');
    const compactRules = css.match(/\.manual-score-panel\.manual-score-compact \{\s+display: grid;[\s\S]{0,2400}/)?.[0] ?? '';

    expect(compactRules).toContain('overflow-y: auto');
    expect(compactRules).toMatch(/\.manual-score-panel\.manual-score-compact \.manual-score-actions \{[\s\S]*position: sticky;[\s\S]*bottom: 0;/);

    const componentSource = readFileSync('src/components/ManualScorePanel.tsx', 'utf8');
    expect(componentSource).toContain('panel.scrollTop = showDetails ? details.offsetTop : 0;');
  });

  it('renders neutral points in the score breakdown', () => {
    const html = renderToStaticMarkup(<ManualScorePanel {...baseProps} />);

    expect(html).toContain('Manual score');
    expect(html).toContain('Neutral');
    // The B/W column heads are aria-hidden, so each number names its own
    // column; the empty half of a row is decorative, not a spoken "hyphen".
    expect(html).toContain('<span class="sr-only">Black </span>');
    expect(html).toContain('<span class="sr-only">White </span>');
    expect(html).toContain('aria-hidden="true">-</b>');
    expect(html).toContain('W+6.5');
    expect(html).toContain('data-manual-score-result-detail="true"');
    expect(html).toContain('White by 6.5');
    expect(html).toContain('data-manual-score-status="true"');
    expect(html).toContain('data-manual-score-status-item="mode"');
    expect(html).toContain('Manual');
    expect(html).toContain('data-manual-score-status-item="dead"');
    expect(html).toContain('data-manual-score-status-item="neutral"');
    expect(html).toContain('data-manual-score-help="true"');
    expect(html).toContain('Click board stones to toggle dead chains · 1 marked dead stone');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-pressed="true"');
  });

  it('names the gesture the pointer can actually make', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        matchMedia: (query: string) => ({
          matches: query === '(pointer: coarse) and (hover: none)',
        }),
      },
    });

    try {
      const html = renderToStaticMarkup(<ManualScorePanel {...baseProps} />);
      expect(html).toContain('Tap board stones to toggle dead chains');
      expect(html).not.toContain('Click board stones');
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
      else delete (globalThis as { window?: unknown }).window;
    }
  });

  it('disables the clear action when no dead stones are marked', () => {
    const html = renderToStaticMarkup(
      <ManualScorePanel {...baseProps} deadStoneCount={0} />,
    );

    expect(html).toContain('title="No dead stones to clear"');
    expect(html).toMatch(/disabled="" title="No dead stones to clear"/);
  });

  it('marks ownership estimates as approximate', () => {
    const html = renderToStaticMarkup(
      <ManualScorePanel
        {...baseProps}
        scoreMode="estimate"
        onAutoEstimate={() => undefined}
        canAutoEstimate
        estimateSource="ownership"
      />,
    );

    expect(html).toContain('manual-score-estimate-mark');
    expect(html).toContain('≈');
    expect(html).toContain('data-score-estimate-source="ownership"');
    expect(html).toContain('Ownership');
  });

  it('exposes local playout estimates when ownership is unavailable', () => {
    const html = renderToStaticMarkup(
      <ManualScorePanel
        {...baseProps}
        scoreMode="estimate"
        onAutoEstimate={() => undefined}
        canAutoEstimate
        estimateSource="playout"
      />,
    );

    expect(html).toContain('Estimate dead stones with local playouts');
    expect(html).toContain('data-score-estimate-source="playout"');
    expect(html).toContain('Playout');
  });

  it('keeps final scoring unavailable when no manual handler is wired', () => {
    const html = renderToStaticMarkup(
      <ManualScorePanel
        {...baseProps}
        scoreMode="estimate"
        onAutoEstimate={() => undefined}
        canAutoEstimate
        estimateSource="ownership"
      />,
    );

    expect(html).toContain('<button type="button" class="" aria-pressed="false" disabled=""');
  });

  it('explains black leads and even scores in beginner-friendly language', () => {
    const blackLeadHtml = renderToStaticMarkup(
      <ManualScorePanel
        {...baseProps}
        score={{
          ...score,
          scoreLead: 3,
          result: 'B+3.0',
        }}
      />,
    );

    const jigoHtml = renderToStaticMarkup(
      <ManualScorePanel
        {...baseProps}
        score={{
          ...score,
          scoreLead: 0,
          result: 'Jigo',
        }}
      />,
    );

    expect(blackLeadHtml).toContain('Black by 3');
    expect(jigoHtml).toContain('Even game');
  });


  it('sizes its controls for touch whenever the mobile shell is running', () => {
    const css = readFileSync('src/index.css', 'utf8');
    const breakpoints = readFileSync('src/utils/layoutBreakpoints.ts', 'utf8');

    // The mobile shell also runs on short, wide windows (width >= 1024 but
    // height < 500). A width-only query left these at their 26-31px desktop
    // heights there while the app was in touch mode — measured 7 targets under
    // 44px at 1280x460, and none at 844x390.
    // Anchor on the rule itself: several blocks share this query now.
    const rule = css.indexOf('.manual-score-method button,');
    expect(rule).toBeGreaterThan(-1);
    const query = css.lastIndexOf('@media', rule);
    expect(query).toBeGreaterThan(-1);
    // Derived from the shell thresholds rather than spelled out again: the
    // mobile query is the complement of the desktop one, so a deliberate
    // breakpoint change should move this with it instead of failing here.
    const minWidth = Number(/DESKTOP_LAYOUT_MIN_WIDTH = (\d+)/.exec(breakpoints)?.[1]);
    const minHeight = Number(/DESKTOP_LAYOUT_MIN_HEIGHT = (\d+)/.exec(breakpoints)?.[1]);
    expect(Number.isFinite(minWidth), 'DESKTOP_LAYOUT_MIN_WIDTH not found').toBe(true);
    expect(Number.isFinite(minHeight), 'DESKTOP_LAYOUT_MIN_HEIGHT not found').toBe(true);
    expect(css.slice(query, css.indexOf('{', query)).trim())
      .toBe(`@media (max-width: ${minWidth - 1}px), (max-height: ${minHeight - 1}px)`);
    const block = css.slice(rule, css.indexOf('}', rule));
    expect(block.length).toBeGreaterThan(40);
    expect(block).toContain('.manual-score-actions button');
    expect(block).toContain('min-height: 44px');
  });
});
