import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnalysisCoverageReadout } from '../src/components/AnalysisPanel';
import { isReportReadyAnalysis, summarizeAnalysisCoverage } from '../src/utils/analysisCoverage';
import type { AnalysisResult, GameNode } from '../src/types';

const unanalyzedNode = (): Pick<GameNode, 'analysis'> => ({
  analysis: null,
});

const analysis = (overrides: Partial<AnalysisResult>): AnalysisResult => ({
  rootWinRate: 0.5,
  rootScoreLead: 0,
  moves: [],
  territory: [],
  policy: undefined,
  ownershipStdev: undefined,
  ...overrides,
});

const analyzedNode = (): Pick<GameNode, 'analysis'> => ({
  analysis: analysis({ moves: [] }),
});

describe('analysis coverage summary', () => {
  it('summarizes empty, partial, and complete current lines', () => {
    expect(summarizeAnalysisCoverage([])).toMatchObject({
      analyzed: 0,
      total: 0,
      valueLabel: '-',
      stateLabel: 'No line',
      tone: 'empty',
    });

    expect(summarizeAnalysisCoverage([unanalyzedNode(), analyzedNode(), unanalyzedNode()])).toMatchObject({
      analyzed: 1,
      total: 3,
      valueLabel: '1/3',
      stateLabel: 'Partial',
      tone: 'partial',
    });

    expect(summarizeAnalysisCoverage([analyzedNode(), analyzedNode()])).toMatchObject({
      analyzed: 2,
      total: 2,
      percent: 1,
      valueLabel: '2/2',
      stateLabel: 'Complete',
      tone: 'complete',
    });
  });

  it('renders a compact graph coverage readout', () => {
    const summary = summarizeAnalysisCoverage([analyzedNode(), unanalyzedNode()]);
    const html = renderToStaticMarkup(
      <AnalysisCoverageReadout summary={summary} className="coverage-card" />
    );

    expect(html).toContain('data-analysis-coverage="true"');
    expect(html).toContain('data-analysis-coverage-tone="partial"');
    expect(html).toContain('Analyzed');
    expect(html).toContain('1/2');
    expect(html).toContain('Partial');
    expect(html).toContain('Analysis coverage for the current line: 1/2 positions.');
  });

  it('can count only report-ready analysis for review actions', () => {
    const quickNode: Pick<GameNode, 'analysis'> = {
      analysis: analysis({ moves: [], rootVisits: undefined }),
    };
    const mctsNode: Pick<GameNode, 'analysis'> = {
      analysis: analysis({ moves: [{ x: 3, y: 3, winRate: 0.55, scoreLead: 1, visits: 8, pointsLost: 0, order: 0 }] }),
    };
    const multiVisitRootNode: Pick<GameNode, 'analysis'> = {
      analysis: analysis({ moves: [], rootVisits: 16 }),
    };

    expect(isReportReadyAnalysis(quickNode.analysis)).toBe(false);
    expect(isReportReadyAnalysis(mctsNode.analysis)).toBe(true);
    expect(isReportReadyAnalysis(multiVisitRootNode.analysis)).toBe(true);

    expect(summarizeAnalysisCoverage([quickNode, mctsNode, multiVisitRootNode], {
      isAnalyzed: (node) => isReportReadyAnalysis(node.analysis),
    })).toMatchObject({
      analyzed: 2,
      total: 3,
      valueLabel: '2/3',
      stateLabel: 'Partial',
      tone: 'partial',
    });
  });
});
