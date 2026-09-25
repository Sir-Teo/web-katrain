import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { indexAtGraphX } from '../src/utils/graphScrub';

const read = (path: string) => readFileSync(path, 'utf8');

describe('graph pointer on a short game', () => {
  it('reads the pointer over the span the points are drawn on', () => {
    // Seven points (root + six moves) drawn across a minimum of 15 intervals:
    // move 6 sits at 6/15 of the width. Reading over count-1 called it move 2.
    const at = (fraction: number) => indexAtGraphX({ clientX: fraction * 300, left: 0, width: 300, count: 7, span: 15 });
    expect(at(6 / 15)).toBe(6);
    expect(at(1)).toBe(6);
    expect(at(2 / 15)).toBe(2);
    // Without a span, the old full-width reading still applies.
    expect(indexAtGraphX({ clientX: 300, left: 0, width: 300, count: 7 })).toBe(6);
  });

  it('is what the graph passes, with the tooltip placed at the drawn point', () => {
    const source = read('src/components/ScoreWinrateGraph.tsx');
    expect(source).toContain('span: Math.max(count - 1, 15)');
    expect(source).toContain('left: `${Math.min(Math.max(0, (hoverIndex * xScale * 100) / width), 88)}%`');
  });
});

describe('score and win-rate graph', () => {
  const source = read('src/components/ScoreWinrateGraph.tsx');

  it('marks the first move of a phase-limited graph', () => {
    expect(source).not.toContain('if (index === 0) return null;');
  });

  it('draws and reads each series only where it has values', () => {
    expect(source).toContain('const showScoreSeries = showScore && hasScoreSeries;');
    expect(source).toContain("showWinrate && hoverHasWin ? `${(50 + hoverWin).toFixed(1)}%` : ''");
    expect(source).toContain('{showScoreSeries && hasGraphData && (');
    expect(source).toContain('{showWinrateSeries && hasGraphData && (');
  });
});

describe('game report', () => {
  const source = read('src/components/GameReportModal.tsx');

  it('keeps the review queue and Show all through analysis landing', () => {
    expect(source).toContain('}, [bucketFilter, mistakeSort, phaseFilter, playerFilter, policyFilter, rootNodeId, setReportHoverMove]);');
    expect(source).toMatch(/setShowAllMistakes\(false\);\s*\}, \[bucketFilter, mistakeSort, playerFilter, phaseFilter, policyFilter\]\);/);
    expect(source).toContain('queue.filter((entry) => isNodeInTree(entry.node, rootNodeId))');
  });

  it('does not remount the graph as analysis progresses', () => {
    expect(source).not.toContain('graphTick');
    expect(source).toContain("key={`${graphRange?.start ?? 0}-${graphRange?.end ?? 'all'}-${reportGraph.score ? 's' : ''}");
  });
});
