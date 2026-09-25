import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Re-analyze dialog number fields', () => {
  const source = read('src/components/GameAnalysisModal.tsx');

  it('keeps what is typed and clamps it once, on blur or start', () => {
    // Clamping each keystroke made "5" into 16 before the zeros: 500 read 1600.
    expect(source).toContain('value={visitsDraft ?? visits}');
    expect(source).toContain('onChange={(e) => setVisitsDraft(e.target.value)}');
    expect(source).toContain('onBlur={commitVisits}');
    expect(source).toContain('onChange={(e) => setStartMoveDraft(e.target.value)}');
    expect(source).toContain('onChange={(e) => setEndMoveDraft(e.target.value)}');
    expect(source).toContain('const v = commitVisits();');
    expect(source).toContain('[commitStartMove(), commitEndMove()]');
  });
});

describe('Analysis command bar', () => {
  const source = read('src/components/AnalysisCommandBar.tsx');

  it('counts a line as reviewed the way the panel does, not by any analysis at all', () => {
    // A Quick graph leaves candidate-less analysis on every node; the bar read
    // that as "Reviewed" and disabled Fast review.
    expect(source).toMatch(/summarizeAnalysisCoverage\(getCurrentLineNodes\(currentNode, activeBranchChildIds\), \{\s*isAnalyzed: \(node\) => isReportReadyAnalysis\(node\.analysis\),/);
  });

  it('restarts the review clock when a new run replaces a running one', () => {
    expect(source).toContain('previousRun.type !== gameAnalysisType || gameAnalysisDone < previousRun.done');
    expect(source).not.toContain('setReviewStartedAt((startedAt) => startedAt ?? now)');
  });
});

describe('Candidate list', () => {
  it('sorts win rate and score best-first for the side to play', () => {
    const source = read('src/components/CandidateMoveList.tsx');

    // The figures are Black's; with White to play, highest-first put White's
    // worst move at the top.
    expect(source).toContain("const forMover = toPlay === 'white' ? -1 : 1;");
    expect(source).toContain("case 'win': return forMover * m.winRate;");
    expect(source).toContain("case 'score': return forMover * m.scoreLead;");
    expect(source).toContain("sortCandidates(onBoard, isPro ? sortKey : 'rank', toPlay)");
  });

  it('drops a previewed candidate when the position changes', () => {
    const source = read('src/components/Layout.tsx');

    expect(source).toMatch(/if \(reportHoverNodeId !== currentNode\.id\) \{\s*setReportHoverNodeId\(currentNode\.id\);\s*if \(reportHoverMove\) setReportHoverMove\(null\);/);
  });
});
