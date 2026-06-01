import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const modalSources = [
  { path: 'src/components/AboutDialog.tsx', titleId: 'about-title', escape: 'useEscapeToClose(onClose)' },
  {
    path: 'src/components/AnalysisCacheClearConfirmModal.tsx',
    titleId: 'analysis-cache-clear-title',
    escape: "window.addEventListener('keydown', handleKeyDown, true)",
  },
  { path: 'src/components/AutoSaveRecoveryModal.tsx', titleId: 'auto-save-recovery-title', escape: 'useEscapeToClose(onDismiss)' },
  { path: 'src/components/CommandPaletteModal.tsx', titleId: 'command-palette-title', escape: 'useEscapeToClose(onClose)' },
  { path: 'src/components/PasteSgfModal.tsx', titleId: 'paste-sgf-title', escape: 'useEscapeToClose(onClose)' },
  { path: 'src/components/GameAnalysisModal.tsx', titleId: 'game-analysis-title', escape: 'useEscapeToClose(onClose)' },
  { path: 'src/components/GameReportModal.tsx', titleId: 'game-report-title', escape: 'useEscapeToClose(onClose, !showReportGuide)' },
  { path: 'src/components/KeyboardHelpModal.tsx', titleId: 'keyboard-help-title', escape: 'useEscapeToClose(onClose)' },
  { path: 'src/components/LibraryPanel.tsx', titleId: 'library-text-dialog-title', escape: 'useEscapeToClose(onClose)' },
  { path: 'src/components/LibraryPanel.tsx', titleId: 'library-confirm-dialog-title', escape: 'useEscapeToClose(onClose)' },
  { path: 'src/components/NewGameModal.tsx', titleId: 'new-game-title', escape: 'useEscapeToClose(onClose)' },
  { path: 'src/components/PhotoBoardModal.tsx', titleId: 'photo-board-title', escape: 'useEscapeToClose(onClose)' },
  { path: 'src/components/SaveToLibraryDialog.tsx', titleId: 'save-to-library-title', escape: 'useEscapeToClose(onClose, open && !saving)' },
  { path: 'src/components/SettingsModal.tsx', titleId: 'settings-title', escape: 'useEscapeToClose(onClose)' },
  { path: 'src/components/UnsavedChangesModal.tsx', titleId: 'unsaved-changes-title', escape: "useEscapeToClose(() => onChoice('cancel'))" },
  { path: 'src/components/layout/MenuDrawer.tsx', titleId: 'menu-title', escape: 'useEscapeToClose(onClose, open)' },
] as const;

describe('modal accessibility semantics', () => {
  it('keeps high-use modals labeled and dismissible by Escape', () => {
    for (const modal of modalSources) {
      const source = readFileSync(modal.path, 'utf8');

      expect(source, modal.path).toContain('role="dialog"');
      expect(source, modal.path).toContain('aria-modal="true"');
      expect(source, modal.path).toContain(`aria-labelledby="${modal.titleId}"`);
      expect(source, modal.path).toContain(modal.escape);
    }
  });
});
