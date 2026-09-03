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
