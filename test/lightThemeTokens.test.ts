import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const themedShellFiles = [
  'src/components/AboutDialog.tsx',
  'src/components/AutoSaveRecoveryModal.tsx',
  'src/components/CommandPaletteModal.tsx',
  'src/components/GameAnalysisModal.tsx',
  'src/components/GameReportModal.tsx',
  'src/components/KeyboardHelpModal.tsx',
  'src/components/LibraryPanel.tsx',
  'src/components/NewGameModal.tsx',
  'src/components/SaveToLibraryDialog.tsx',
  'src/components/Timer.tsx',
  'src/components/layout/BottomControlBar.tsx',
  'src/components/layout/MenuDrawer.tsx',
  'src/components/layout/MobileTabBar.tsx',
  'src/components/layout/RightPanel.tsx',
  'src/components/layout/StatusBar.tsx',
  'src/components/layout/TopControlBar.tsx',
  'src/components/layout/ui.tsx',
] as const;

describe('light theme shell tokens', () => {
  it('keeps app fonts local and offline-safe', () => {
    const css = [
      readFileSync('src/index.css', 'utf8'),
      readFileSync('src/components/dashboard/dashboard.css', 'utf8'),
    ].join('\n');

    expect(css).not.toContain('fonts.googleapis.com');
    expect(css).not.toContain('fonts.gstatic.com');
    expect(css).toContain('--ui-font: ui-sans-serif');
    expect(css).toContain('--ui-font-mono: ui-monospace');
    // The dashboard aliases its font tokens onto the shared --ui-* stacks so
    // there is a single, offline-safe definition.
    expect(css).toContain('--sans: var(--ui-font)');
    expect(css).toContain('--mono: var(--ui-font-mono)');
  });

  it('keeps shared shell hover text on theme tokens instead of hard white', () => {
    for (const file of themedShellFiles) {
      expect(readFileSync(file, 'utf8'), file).not.toContain('hover:text-white');
    }
  });

  it('keeps timer surfaces on theme tokens instead of hard dark slate', () => {
    const timer = readFileSync('src/components/Timer.tsx', 'utf8');

    expect(timer).not.toContain('bg-slate-900');
    expect(timer).not.toContain('bg-slate-800');
    expect(timer).not.toContain('border-slate-700');
    expect(timer).not.toContain('text-slate-100');
    expect(timer).not.toContain('text-slate-200');
  });

  it('keeps navigation metadata on theme tokens', () => {
    const navigationFiles = [
      'src/components/layout/BottomControlBar.tsx',
      'src/components/layout/RightPanel.tsx',
      'src/components/layout/StatusBar.tsx',
    ];

    for (const file of navigationFiles) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toContain('text-slate-500');
      expect(source, file).not.toContain('text-slate-600');
      expect(source, file).not.toContain('bg-slate-950');
      expect(source, file).not.toContain('text-slate-900');
      expect(source, file).not.toContain('font-semibold text-white');
    }
  });

  it('keeps board analysis overlays and modal actions on theme tokens', () => {
    const board = readFileSync('src/components/GoBoard.tsx', 'utf8');
    const analysisModal = readFileSync('src/components/GameAnalysisModal.tsx', 'utf8');

    expect(board).not.toContain('bg-slate-900 text-white');
    expect(board).not.toContain('border-slate-700/50');
    expect(analysisModal).not.toContain('bg-[var(--ui-surface-2)] hover:brightness-110 text-white');
    expect(analysisModal).toContain('text-[var(--ui-text)] border border-[var(--ui-border)]');
  });

  it('keeps the interactive game report chrome on theme tokens', () => {
    const report = readFileSync('src/components/GameReportModal.tsx', 'utf8');
    const between = (start: string, end: string) => {
      const from = report.indexOf(start);
      const to = report.indexOf(end, from);
      expect(from, start).toBeGreaterThanOrEqual(0);
      expect(to, end).toBeGreaterThan(from);
      return report.slice(from, to);
    };
    const interactiveReport = [
      between('const renderMistakeRows', 'const renderPvTree'),
      between('<div className="print-hide space-y-4"', '<div className="hidden print-only'),
      between('<div className="px-5 py-4 ui-bar', '{showReportGuide &&'),
    ].join('\n');
    const hardDarkTokens = [
      'bg-slate-900/70',
      'bg-slate-950/40',
      'bg-slate-950/30',
      'bg-slate-900/60',
      'bg-slate-800/70',
      'border-slate-700/50',
      'border-slate-700/60',
      'border-slate-700/40',
      'text-slate-100',
      'text-slate-200',
      'text-slate-300',
      'text-slate-400',
      'text-slate-500',
      'hover:bg-slate-800/80',
      'hover:bg-slate-900/60',
      'bg-slate-950',
      'bg-slate-100',
      'bg-slate-200/80',
      'bg-slate-400/80',
      'border-slate-400',
      'border-slate-300',
      'text-gray-500',
      'bg-[var(--ui-surface-2)] hover:brightness-110 text-white',
      'bg-[var(--ui-surface-2)] text-white',
    ];

    for (const token of hardDarkTokens) {
      expect(interactiveReport, token).not.toContain(token);
    }

    expect(interactiveReport).toContain('game-report-player-swatch--black');
    expect(interactiveReport).toContain('game-report-histogram-bar--black');
  });

  it('keeps the interactive game report PV tree on theme tokens', () => {
    const report = readFileSync('src/components/GameReportModal.tsx', 'utf8');
    const start = report.indexOf('const renderPvTree');
    const end = report.indexOf('const refreshSnapshot', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const pvTree = report.slice(start, end);

    expect(pvTree).not.toContain('text-slate-500');
    expect(pvTree).not.toContain('text-slate-700');
    expect(pvTree).toContain('${mutedClass} pdf-tree-node');
    expect(pvTree).toContain('${faintClass}');
  });
});
