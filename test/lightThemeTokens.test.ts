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
});
