import { useEffect } from 'react';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';
import { generateSgfFromTree, type KaTrainSgfExportOptions } from '../utils/sgf';
import type { UiMode } from '../components/layout/types';
import { eventMatchesShortcut, loadShortcutOverrides } from '../utils/shortcuts';

interface UseKeyboardShortcutsOptions {
  mode: UiMode;
  sgfExportOptions: KaTrainSgfExportOptions;
  saveSgf: () => void;
  openSgf: () => void;
  setIsSettingsOpen: (v: boolean) => void;
  setIsGameAnalysisOpen: (v: boolean) => void;
  setIsGameReportOpen: (v: boolean) => void;
  setAnalysisMenuOpen: (v: boolean) => void;
  setViewMenuOpen: (v: boolean) => void;
  setMenuOpen: (v: boolean) => void;
  setIsKeyboardHelpOpen: (v: boolean) => void;
  openPasteSgf: () => void;
  openNewGame: () => void;
  toggleLibrary: () => void;
  closeLibrary: () => void;
  toggleSidebar: () => void;
  toast: (msg: string, type: 'info' | 'error' | 'success') => void;
}

export function useKeyboardShortcuts({
  mode,
  sgfExportOptions,
  saveSgf,
  openSgf,
  setIsSettingsOpen,
  setIsGameAnalysisOpen,
  setIsGameReportOpen,
  setAnalysisMenuOpen,
  setViewMenuOpen,
  setMenuOpen,
  setIsKeyboardHelpOpen,
  openPasteSgf,
  openNewGame,
  toggleLibrary,
  closeLibrary,
  toggleSidebar,
  toast,
}: UseKeyboardShortcutsOptions): void {
  const {
    passTurn,
    rotateBoard,
    navigateBack,
    navigateForward,
    navigateStart,
    navigateEnd,
    switchBranch,
    undoToBranchPoint,
    undoToMainBranch,
    makeCurrentNodeMainBranch,
    findMistake,
    analyzeExtra,
    resetCurrentAnalysis,
    toggleAnalysisMode,
    toggleContinuousAnalysis,
    startSelectRegionOfInterest,
    cancelSelectRegionOfInterest,
    isSelectingRegionOfInterest,
    isInsertMode,
    toggleInsertMode,
    selfplayToEnd,
    makeAiMove,
    rootNode,
    settings,
    updateSettings,
  } = useGameStore(
    (state) => ({
      passTurn: state.passTurn,
      rotateBoard: state.rotateBoard,
      navigateBack: state.navigateBack,
      navigateForward: state.navigateForward,
      navigateStart: state.navigateStart,
      navigateEnd: state.navigateEnd,
      switchBranch: state.switchBranch,
      undoToBranchPoint: state.undoToBranchPoint,
      undoToMainBranch: state.undoToMainBranch,
      makeCurrentNodeMainBranch: state.makeCurrentNodeMainBranch,
      findMistake: state.findMistake,
      analyzeExtra: state.analyzeExtra,
      resetCurrentAnalysis: state.resetCurrentAnalysis,
      toggleAnalysisMode: state.toggleAnalysisMode,
      toggleContinuousAnalysis: state.toggleContinuousAnalysis,
      startSelectRegionOfInterest: state.startSelectRegionOfInterest,
      cancelSelectRegionOfInterest: state.cancelSelectRegionOfInterest,
      isSelectingRegionOfInterest: state.isSelectingRegionOfInterest,
      isInsertMode: state.isInsertMode,
      toggleInsertMode: state.toggleInsertMode,
      selfplayToEnd: state.selfplayToEnd,
      makeAiMove: state.makeAiMove,
      rootNode: state.rootNode,
      settings: state.settings,
      updateSettings: state.updateSettings,
    }),
    shallow
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const isTyping =
        !!active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.tagName === 'SELECT' ||
          active.isContentEditable);
      if (isTyping) return;

      const shift = e.shiftKey;
      const overrides = loadShortcutOverrides();
      const matches = (id: string) => eventMatchesShortcut(e, id, overrides);

      const jumpBack = (n: number) => {
        for (let i = 0; i < n; i++) navigateBack();
      };
      const jumpForward = (n: number) => {
        for (let i = 0; i < n; i++) navigateForward();
      };

      const copySgfToClipboard = async () => {
        const sgf = generateSgfFromTree(rootNode, sgfExportOptions);
        try {
          await navigator.clipboard.writeText(sgf);
          toast('Copied SGF to clipboard.', 'success');
        } catch {
          try {
            const ta = document.createElement('textarea');
            ta.value = sgf;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            toast('Copied SGF to clipboard.', 'success');
          } catch {
            toast('Copy failed (clipboard unavailable).', 'error');
          }
        }
      };

      // File operations
      if (matches('save-sgf')) {
        e.preventDefault();
        saveSgf();
        return;
      }
      if (matches('toggle-library')) {
        e.preventDefault();
        toggleLibrary();
        return;
      }
      if (matches('open-sgf')) {
        e.preventDefault();
        openSgf();
        return;
      }
      if (matches('toggle-sidebar')) {
        e.preventDefault();
        toggleSidebar();
        return;
      }
      if (matches('copy-sgf')) {
        e.preventDefault();
        void copySgfToClipboard();
        return;
      }
      if (matches('paste-sgf')) {
        e.preventDefault();
        openPasteSgf();
        return;
      }
      if (matches('new-game')) {
        e.preventDefault();
        openNewGame();
        return;
      }

      // Escape
      if (matches('escape')) {
        e.preventDefault();
        if (isSelectingRegionOfInterest) cancelSelectRegionOfInterest();
        analyzeExtra('stop');
        setIsSettingsOpen(false);
        setIsGameAnalysisOpen(false);
        setIsGameReportOpen(false);
        setAnalysisMenuOpen(false);
        setViewMenuOpen(false);
        setMenuOpen(false);
        setIsKeyboardHelpOpen(false);
        closeLibrary();
        return;
      }

      // Keyboard help
      if (matches('keyboard-help')) {
        e.preventDefault();
        setIsKeyboardHelpOpen(true);
        return;
      }

      // Fullscreen
      if (matches('fullscreen')) {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.().catch(() => {});
        } else {
          document.exitFullscreen?.().catch(() => {});
        }
        return;
      }

      // Continuous analysis
      if (matches('continuous-analysis')) {
        e.preventDefault();
        toggleContinuousAnalysis(shift);
        return;
      }

      // Game control
      if (matches('pass')) {
        e.preventDefault();
        passTurn();
        return;
      }

      if (matches('rotate-board')) {
        e.preventDefault();
        rotateBoard();
        return;
      }

      // Display toggles
      if (matches('toggle-coordinates')) {
        e.preventDefault();
        updateSettings({ showCoordinates: !settings.showCoordinates });
        return;
      }
      if (matches('toggle-move-numbers')) {
        e.preventDefault();
        updateSettings({ showMoveNumbers: !settings.showMoveNumbers });
        return;
      }

      // Visualization toggles
      if (matches('toggle-children')) {
        e.preventDefault();
        updateSettings({ analysisShowChildren: !settings.analysisShowChildren });
        return;
      }
      if (matches('toggle-eval')) {
        e.preventDefault();
        updateSettings({ analysisShowEval: !settings.analysisShowEval });
        return;
      }
      if (matches('toggle-hints')) {
        e.preventDefault();
        if (!settings.analysisShowPolicy) updateSettings({ analysisShowHints: !settings.analysisShowHints });
        return;
      }
      if (matches('toggle-policy')) {
        e.preventDefault();
        updateSettings({ analysisShowPolicy: !settings.analysisShowPolicy });
        return;
      }
      if (matches('toggle-territory')) {
        e.preventDefault();
        updateSettings({ analysisShowOwnership: !settings.analysisShowOwnership });
        return;
      }

      // Analysis actions
      if (matches('analysis-extra')) {
        e.preventDefault();
        analyzeExtra('extra');
        return;
      }
      if (matches('analysis-equalize')) {
        e.preventDefault();
        analyzeExtra('equalize');
        return;
      }
      if (matches('analysis-sweep')) {
        e.preventDefault();
        analyzeExtra('sweep');
        return;
      }
      if (matches('analysis-alternative')) {
        e.preventDefault();
        analyzeExtra('alternative');
        return;
      }
      if (matches('select-region')) {
        e.preventDefault();
        startSelectRegionOfInterest();
        return;
      }
      if (matches('reset-analysis')) {
        e.preventDefault();
        resetCurrentAnalysis();
        return;
      }
      if (matches('toggle-insert')) {
        e.preventDefault();
        toggleInsertMode();
        return;
      }
      if (matches('selfplay')) {
        e.preventDefault();
        selfplayToEnd();
        return;
      }

      // Branch navigation
      if (matches('undo-main-branch') || matches('undo-branch-point')) {
        e.preventDefault();
        if (isInsertMode) {
          toast('Finish inserting before navigating.', 'error');
          return;
        }
        if (matches('undo-main-branch')) undoToMainBranch();
        else undoToBranchPoint();
        return;
      }

      // Find mistakes
      if (matches('next-mistake') || matches('prev-mistake')) {
        e.preventDefault();
        findMistake(matches('prev-mistake') ? 'undo' : 'redo');
        return;
      }

      // Tab toggle
      if (matches('toggle-analysis')) {
        e.preventDefault();
        toggleAnalysisMode();
        return;
      }

      // Home/End
      if (matches('nav-start')) {
        e.preventDefault();
        if (isInsertMode) {
          toast('Finish inserting before navigating.', 'error');
          return;
        }
        navigateStart();
        return;
      }
      if (matches('nav-end')) {
        e.preventDefault();
        if (isInsertMode) {
          toast('Finish inserting before navigating.', 'error');
          return;
        }
        navigateEnd();
        return;
      }

      // Arrow up/down (branch switch)
      if (matches('branch-prev')) {
        e.preventDefault();
        if (isInsertMode) {
          toast('Finish inserting before navigating.', 'error');
          return;
        }
        switchBranch(-1);
        return;
      }
      if (matches('branch-next')) {
        e.preventDefault();
        if (isInsertMode) {
          toast('Finish inserting before navigating.', 'error');
          return;
        }
        switchBranch(1);
        return;
      }

      // Arrow left/right (navigation)
      if (matches('nav-back') || matches('nav-back-10')) {
        e.preventDefault();
        if (matches('nav-back-10')) jumpBack(10);
        else {
          if (mode === 'play') {
            const st = useGameStore.getState();
            const lastMover = st.currentNode.move?.player ?? null;
            const shouldUndoTwice = !!st.isAiPlaying && !!st.aiColor && lastMover === st.aiColor && st.currentPlayer !== st.aiColor;
            navigateBack();
            if (shouldUndoTwice) navigateBack();
          } else {
            navigateBack();
          }
        }
        return;
      }
      if (matches('nav-forward') || matches('nav-forward-10')) {
        e.preventDefault();
        if (isInsertMode) {
          toast('Finish inserting before navigating.', 'error');
          return;
        }
        if (matches('nav-forward-10')) jumpForward(10);
        else navigateForward();
        return;
      }

      // PageUp (make main branch)
      if (matches('make-main-branch')) {
        e.preventDefault();
        if (isInsertMode) {
          toast('Finish inserting before navigating.', 'error');
          return;
        }
        makeCurrentNodeMainBranch();
        return;
      }

      // Enter (AI move)
      if (matches('ai-move')) {
        e.preventDefault();
        makeAiMove();
        return;
      }

      // Function keys (modals)
      if (matches('game-analysis-modal')) {
        e.preventDefault();
        setIsGameAnalysisOpen(true);
        return;
      }
      if (matches('game-report-modal')) {
        e.preventDefault();
        setIsGameReportOpen(true);
        return;
      }
      if (matches('settings-modal')) {
        e.preventDefault();
        setIsSettingsOpen(true);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    navigateBack,
    navigateForward,
    navigateStart,
    navigateEnd,
    toggleContinuousAnalysis,
    passTurn,
    rotateBoard,
    mode,
    toggleAnalysisMode,
    updateSettings,
    openPasteSgf,
    settings.showCoordinates,
    settings.showMoveNumbers,
    settings.analysisShowChildren,
    settings.analysisShowEval,
    settings.analysisShowHints,
    settings.analysisShowPolicy,
    settings.analysisShowOwnership,
    makeAiMove,
    rootNode,
    findMistake,
    analyzeExtra,
    resetCurrentAnalysis,
    startSelectRegionOfInterest,
    cancelSelectRegionOfInterest,
    isSelectingRegionOfInterest,
    isInsertMode,
    toggleInsertMode,
    selfplayToEnd,
    switchBranch,
    undoToBranchPoint,
    undoToMainBranch,
    makeCurrentNodeMainBranch,
    sgfExportOptions,
    saveSgf,
    openSgf,
    setIsSettingsOpen,
    setIsGameAnalysisOpen,
    setIsGameReportOpen,
    setAnalysisMenuOpen,
    setViewMenuOpen,
    setMenuOpen,
    setIsKeyboardHelpOpen,
    openNewGame,
    toggleLibrary,
    closeLibrary,
    toggleSidebar,
    toast,
  ]);
}
