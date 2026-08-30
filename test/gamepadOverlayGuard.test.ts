import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('gamepad overlay guard', () => {
  it('cannot navigate the board behind modal and menu surfaces', () => {
    const source = readFileSync('src/components/Layout.tsx', 'utf8');
    const start = source.indexOf('const gamepadBlockedByOverlay = Boolean(');
    const end = source.indexOf('\n  );', start);
    const guard = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    for (const state of [
      'isSettingsOpen',
      'isAboutOpen',
      'autoSaveRecovery',
      'isUnsavedChangesOpen',
      'isGameAnalysisOpen',
      'isKifuPrintOpen',
      'isGameReportOpen',
      'isCommandPaletteOpen',
      'isKeyboardHelpOpen',
      'isNewGameOpen',
      'isScoreQuizOpen',
      'isTournamentOpen',
      'isProGamesOpen',
      'isLessonsOpen',
      'isGuessMoveOpen',
      'isProblemOpen',
      'isPhotoBoardOpen',
      'isPasteSgfOpen',
      'saveToLibraryDialog',
      'pendingResignPlayer',
      'isClearAnalysisCacheConfirmOpen',
      'menuOpen',
      'viewMenuOpen',
      'isMobile && libraryOpen',
    ]) {
      expect(guard, state).toContain(state);
    }
    expect(source).toContain('!gamepadBlockedByOverlay');
  });
});
