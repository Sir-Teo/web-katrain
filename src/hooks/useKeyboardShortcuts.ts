import { useEffect } from 'react';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';
import { downloadSgfFromTree, generateSgfFromTree, parseSgf, type KaTrainSgfExportOptions } from '../utils/sgf';
import type { UiMode } from '../components/layout/types';

interface UseKeyboardShortcutsOptions {
  mode: UiMode;
  sgfExportOptions: KaTrainSgfExportOptions;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  setIsSettingsOpen: (v: boolean) => void;
  setIsGameAnalysisOpen: (v: boolean) => void;
  setIsGameReportOpen: (v: boolean) => void;
  setAnalysisMenuOpen: (v: boolean) => void;
  setViewMenuOpen: (v: boolean) => void;
  setMenuOpen: (v: boolean) => void;
  setIsKeyboardHelpOpen: (v: boolean) => void;
  toggleLibrary: () => void;
  closeLibrary: () => void;
  toggleSidebar: () => void;
  toast: (msg: string, type: 'info' | 'error' | 'success') => void;
}

export function useKeyboardShortcuts({
  mode,
  sgfExportOptions,
  fileInputRef,
  setIsSettingsOpen,
  setIsGameAnalysisOpen,
  setIsGameReportOpen,
  setAnalysisMenuOpen,
  setViewMenuOpen,
  setMenuOpen,
  setIsKeyboardHelpOpen,
  toggleLibrary,
  closeLibrary,
  toggleSidebar,
  toast,
}: UseKeyboardShortcutsOptions): void {
  const {
    resetGame,
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
    loadGame,
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
      resetGame: state.resetGame,
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
      loadGame: state.loadGame,
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

      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const key = e.key;
      const keyLower = key.toLowerCase();

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

      const pasteSgfFromClipboard = async () => {
        let text: string | null = null;
        try {
          text = await navigator.clipboard.readText();
        } catch {
          text = window.prompt('Paste SGF here:') ?? null;
        }
        if (!text) return;
        try {
          const parsed = parseSgf(text);
          loadGame(parsed);
          navigateEnd();
          toast('Loaded SGF from clipboard.', 'success');
        } catch {
          toast('Failed to parse SGF from clipboard.', 'error');
        }
      };

      // File operations
      if (ctrl && keyLower === 's') {
        e.preventDefault();
        downloadSgfFromTree(rootNode, sgfExportOptions);
        return;
      }
      if (ctrl && keyLower === 'l') {
        e.preventDefault();
        toggleLibrary();
        return;
      }
      if (ctrl && keyLower === 'o') {
        e.preventDefault();
        fileInputRef.current?.click();
        return;
      }
      if (ctrl && keyLower === 'b') {
        e.preventDefault();
        toggleSidebar();
        return;
      }
      if (ctrl && keyLower === 'c') {
        e.preventDefault();
        void copySgfToClipboard();
        return;
      }
      if (ctrl && keyLower === 'v') {
        e.preventDefault();
        void pasteSgfFromClipboard();
        return;
      }
      if (ctrl && keyLower === 'n') {
        e.preventDefault();
        resetGame();
        return;
      }

      // Escape
      if (key === 'Escape') {
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
      if (key === '?' || (shift && key === '/')) {
        e.preventDefault();
        setIsKeyboardHelpOpen(true);
        return;
      }

      // Fullscreen
      if (keyLower === 'f') {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.().catch(() => {});
        } else {
          document.exitFullscreen?.().catch(() => {});
        }
        return;
      }

      // Continuous analysis
      if (key === ' ' || key === 'Spacebar') {
        e.preventDefault();
        toggleContinuousAnalysis(shift);
        return;
      }

      // Game control
      if (keyLower === 'p') {
        e.preventDefault();
        passTurn();
        return;
      }

      if (keyLower === 'o') {
        e.preventDefault();
        rotateBoard();
        return;
      }

      // Display toggles
      if (keyLower === 'k') {
        e.preventDefault();
        updateSettings({ showCoordinates: !settings.showCoordinates });
        return;
      }
      if (keyLower === 'm') {
        e.preventDefault();
        updateSettings({ showMoveNumbers: !settings.showMoveNumbers });
        return;
      }

      // Visualization toggles
      if (keyLower === 'q') {
        e.preventDefault();
        updateSettings({ analysisShowChildren: !settings.analysisShowChildren });
        return;
      }
      if (keyLower === 'w') {
        e.preventDefault();
        updateSettings({ analysisShowEval: !settings.analysisShowEval });
        return;
      }
      if (keyLower === 'e') {
        e.preventDefault();
        if (!settings.analysisShowPolicy) updateSettings({ analysisShowHints: !settings.analysisShowHints });
        return;
      }
      if (keyLower === 'r') {
        e.preventDefault();
        updateSettings({ analysisShowPolicy: !settings.analysisShowPolicy });
        return;
      }
      if (keyLower === 't') {
        e.preventDefault();
        updateSettings({ analysisShowOwnership: !settings.analysisShowOwnership });
        return;
      }

      // Analysis actions
      if (keyLower === 'a') {
        e.preventDefault();
        analyzeExtra('extra');
        return;
      }
      if (keyLower === 's') {
        e.preventDefault();
        analyzeExtra('equalize');
        return;
      }
      if (keyLower === 'd') {
        e.preventDefault();
        analyzeExtra('sweep');
        return;
      }
      if (keyLower === 'f') {
        e.preventDefault();
        analyzeExtra('alternative');
        return;
      }
      if (keyLower === 'g') {
        e.preventDefault();
        startSelectRegionOfInterest();
        return;
      }
      if (keyLower === 'h') {
        e.preventDefault();
        resetCurrentAnalysis();
        return;
      }
      if (keyLower === 'i') {
        e.preventDefault();
        toggleInsertMode();
        return;
      }
      if (keyLower === 'l') {
        e.preventDefault();
        selfplayToEnd();
        return;
      }

      // Branch navigation
      if (keyLower === 'b') {
        e.preventDefault();
        if (isInsertMode) {
          toast('Finish inserting before navigating.', 'error');
          return;
        }
        if (shift) undoToMainBranch();
        else undoToBranchPoint();
        return;
      }

      // Find mistakes
      if (keyLower === 'n') {
        e.preventDefault();
        findMistake(shift ? 'undo' : 'redo');
        return;
      }

      // Tab toggle
      if (key === 'Tab') {
        e.preventDefault();
        toggleAnalysisMode();
        return;
      }

      // Home/End
      if (key === 'Home') {
        e.preventDefault();
        if (isInsertMode) {
          toast('Finish inserting before navigating.', 'error');
          return;
        }
        navigateStart();
        return;
      }
      if (key === 'End') {
        e.preventDefault();
        if (isInsertMode) {
          toast('Finish inserting before navigating.', 'error');
          return;
        }
        navigateEnd();
        return;
      }

      // Arrow up/down (branch switch)
      if (key === 'ArrowUp') {
        e.preventDefault();
        if (isInsertMode) {
          toast('Finish inserting before navigating.', 'error');
          return;
        }
        switchBranch(-1);
        return;
      }
      if (key === 'ArrowDown') {
        e.preventDefault();
        if (isInsertMode) {
          toast('Finish inserting before navigating.', 'error');
          return;
        }
        switchBranch(1);
        return;
      }

      // Arrow left/right (navigation)
      if (key === 'ArrowLeft' || keyLower === 'z') {
        e.preventDefault();
        if (ctrl) navigateStart();
        else if (shift) jumpBack(10);
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
      if (key === 'ArrowRight' || keyLower === 'x') {
        e.preventDefault();
        if (isInsertMode) {
          toast('Finish inserting before navigating.', 'error');
          return;
        }
        if (ctrl) navigateEnd();
        else if (shift) jumpForward(10);
        else navigateForward();
        return;
      }

      // PageUp (make main branch)
      if (key === 'PageUp') {
        e.preventDefault();
        if (isInsertMode) {
          toast('Finish inserting before navigating.', 'error');
          return;
        }
        makeCurrentNodeMainBranch();
        return;
      }

      // Enter (AI move)
      if (key === 'Enter') {
        e.preventDefault();
        makeAiMove();
        return;
      }

      // Function keys (modals)
      if (key === 'F2') {
        e.preventDefault();
        setIsGameAnalysisOpen(true);
        return;
      }
      if (key === 'F3') {
        e.preventDefault();
        setIsGameReportOpen(true);
        return;
      }
      if (key === 'F8') {
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
    resetGame,
    passTurn,
    rotateBoard,
    mode,
    toggleAnalysisMode,
    updateSettings,
    settings.showCoordinates,
    settings.showMoveNumbers,
    settings.analysisShowChildren,
    settings.analysisShowEval,
    settings.analysisShowHints,
    settings.analysisShowPolicy,
    settings.analysisShowOwnership,
    makeAiMove,
    rootNode,
    loadGame,
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
    fileInputRef,
    setIsSettingsOpen,
    setIsGameAnalysisOpen,
    setIsGameReportOpen,
    setAnalysisMenuOpen,
    setMenuOpen,
    setIsKeyboardHelpOpen,
    toast,
  ]);
}
