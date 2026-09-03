import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  formatCandidatePointsLost,
  formatCandidateScore,
  formatCandidateVisits,
  formatCandidateWinRate,
} from '../src/utils/candidateMoveFormat';

describe('candidate move columns', () => {
  it('signs the score so the side it favours is never in doubt', () => {
    expect(formatCandidateScore(1.24)).toBe('+1.2');
    expect(formatCandidateScore(-3)).toBe('−3.0');
    expect(formatCandidateScore(0)).toBe('0.0');
    // Rounding to a tenth first, so a value that displays as zero is not
    // printed with a sign the digits do not support.
    expect(formatCandidateScore(-0.02)).toBe('0.0');
    expect(formatCandidateScore(undefined)).toBe('—');
    expect(formatCandidateScore(Number.NaN)).toBe('—');
  });

  it('uses a minus sign, not a hyphen, so the column stays aligned', () => {
    expect(formatCandidateScore(-1)).toContain('−');
    expect(formatCandidatePointsLost(1)).toContain('−');
  });

  it('shows points lost as a loss and never as a gain', () => {
    expect(formatCandidatePointsLost(2.4)).toBe('−2.4');
    expect(formatCandidatePointsLost(0)).toBe('0.0');
    // Search noise puts a candidate marginally above the engine's own pick.
    expect(formatCandidatePointsLost(-1.1)).toBe('0.0');
    expect(formatCandidatePointsLost(undefined)).toBe('—');
  });

  it('keeps visits inside a narrow column', () => {
    expect(formatCandidateVisits(812)).toBe('812');
    expect(formatCandidateVisits(1949)).toBe('1.9k');
    expect(formatCandidateVisits(120_400)).toBe('120k');
    expect(formatCandidateVisits(undefined)).toBe('—');
  });

  it('formats the win rate as a percentage', () => {
    expect(formatCandidateWinRate(0.5153)).toBe('51.5%');
    expect(formatCandidateWinRate(undefined)).toBe('—');
  });
});

describe('the candidate list', () => {
  const source = readFileSync('src/components/CandidateMoveList.tsx', 'utf8');

  it('withholds the list while a drill is asking for exactly these moves', () => {
    expect(source).toContain('isDrillHidingAnswer(state.mistakeDrill, state.currentNode.id)');
  });

  it('plays a row only once that row is the one on the board', () => {
    // On a touchscreen no hover arrives before the tap, so this is what makes
    // the first tap a preview and the second the move.
    expect(source).toContain('if (hoveredKey !== key) {');
    expect(source).toMatch(/onHover\(null\);\s*\n\s*playMove\(move\.x, move\.y\);/);
  });

  it('is reachable from both shells, which have separate panels', () => {
    // The desktop dashboard and the mobile RightPanel are two different panel
    // implementations; a section added to one is absent from the other.
    for (const path of [
      'src/components/layout/RightPanel.tsx',
      'src/components/dashboard/DesktopDashboard.tsx',
    ]) {
      expect(readFileSync(path, 'utf8'), path).toContain('<CandidateMoveList');
    }
  });

  it('uses plain-language quality in Coach and comparative engine columns in Pro', () => {
    expect(source).toContain("const isPro = analysisExperience === 'pro';");
    expect(source).toContain('<span className="cl-quality" aria-hidden="true">Quality</span>');
    expect(source).toContain("sortButton('visits', 'Visits'");
    // Pro honours the Settings cap instead of a private 24-row limit.
    expect(source).toContain('Math.min(Number.isFinite(topK) ? topK : 10, 50)');
    expect(source).toContain('data-analysis-experience={analysisExperience}');
  });
});

describe('candidate list controls', () => {
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../src/components/CandidateMoveList.tsx', import.meta.url), 'utf8');

  /**
   * These four are Pro-only, and a Pro candidate list needs analysis data to
   * render at all, so `npm run test:viewport` -- which drives the app in its
   * default Coach experience with no engine -- cannot see them. It measured
   * every other target at the WCAG 2.2 SC 2.5.8 floor while these four sat at
   * 16-21px tall. Measured live at 1440x900 after the fix: all 24px or more,
   * with the detail columns open and closed.
   */
  it('holds every Pro control at the 24px WCAG floor', () => {
    const block = (selector: string): string => {
      const start = css.indexOf(selector);
      expect(start, selector).toBeGreaterThan(-1);
      return css.slice(start, css.indexOf('}', start));
    };
    expect(block('.candidate-list-head .cl-sort {')).toContain('min-height: 1.5rem');
    expect(block('.candidate-list-head .cl-detail-toggle {')).toContain('width: 1.5rem');
    expect(block('.candidate-list-head .cl-detail-toggle {')).toContain('height: 1.5rem');
    expect(block('.candidate-row .cl-pv-toggle {')).toContain('width: 1.5rem');
    expect(block('.candidate-row .cl-pv-toggle {')).toContain('height: 1.5rem');
    expect(block('.candidate-list .cl-pv-action {')).toContain('min-height: 1.5rem');
    // The head budgets exactly 1.5rem in the list's max-height, so the taller
    // controls have to replace its padding rather than stack on top of it.
    expect(block('.candidate-list-head {')).toContain('padding-block: 0');
    expect(source).toContain("+ 1.5rem");
  });

  it('fades a candidate the search has barely read, as the board does', () => {
    expect(source).toContain('state.settings.trainerLowVisits');
    expect(source).toContain("move.order !== 0 && move.visits < lowVisitsThreshold");
    expect(css).toContain('.candidate-row.is-uncertain .cl-num');
  });
});
