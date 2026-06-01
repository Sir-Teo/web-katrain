import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const modalSources = [
  { path: 'src/components/PasteSgfModal.tsx', titleId: 'paste-sgf-title' },
  { path: 'src/components/GameAnalysisModal.tsx', titleId: 'game-analysis-title' },
  { path: 'src/components/NewGameModal.tsx', titleId: 'new-game-title' },
  { path: 'src/components/PhotoBoardModal.tsx', titleId: 'photo-board-title' },
] as const;

describe('modal accessibility semantics', () => {
  it('keeps high-use modals labeled and dismissible by Escape', () => {
    for (const modal of modalSources) {
      const source = readFileSync(modal.path, 'utf8');

      expect(source, modal.path).toContain('role="dialog"');
      expect(source, modal.path).toContain('aria-modal="true"');
      expect(source, modal.path).toContain(`aria-labelledby="${modal.titleId}"`);
      expect(source, modal.path).toContain('useEscapeToClose(onClose)');
    }
  });
});
