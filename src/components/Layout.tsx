import React, { useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { GoBoard } from './GoBoard';
import { WinRateGraph } from './WinRateGraph';
import { SettingsModal } from './SettingsModal';
import { MoveTree } from './MoveTree';
import { FaPlay, FaCog, FaChartBar, FaEllipsisH, FaRobot, FaArrowLeft, FaArrowRight, FaSave, FaFolderOpen, FaMicrochip, FaGraduationCap, FaTimes } from 'react-icons/fa';
import { downloadSgfFromTree, generateSgfFromTree, parseSgf } from '../utils/sgf';
import type { CandidateMove } from '../types';

export const Layout: React.FC = () => {
  const {
    resetGame,
    passTurn,
    makeAiMove,
    capturedBlack,
    capturedWhite,
    toggleAi,
    isAiPlaying,
    navigateBack,
    navigateForward,
    navigateStart,
    navigateEnd,
    switchBranch,
    undoToBranchPoint,
    undoToMainBranch,
    makeCurrentNodeMainBranch,
    findMistake,
    deleteCurrentNode,
    pruneCurrentBranch,
    loadGame,
    toggleAnalysisMode,
    isAnalysisMode,
    isContinuousAnalysis,
    toggleContinuousAnalysis,
    stopAnalysis,
    toggleTeachMode,
    isTeachMode,
    notification,
    clearNotification,
    analysisData,
    playMove,
    currentNode,
    runAnalysis,
    settings,
    updateSettings,
    rootNode,
    ...storeRest
  } = useGameStore();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [hoveredMove, setHoveredMove] = useState<CandidateMove | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
        setTimer(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      return `${m}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!isAnalysisMode) return;
    void runAnalysis();
  }, [currentNode.id, isAnalysisMode, runAnalysis]);

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

        const toast = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
            useGameStore.setState({ notification: { message, type } });
            window.setTimeout(() => useGameStore.setState({ notification: null }), 2500);
        };

        const jumpBack = (n: number) => {
            for (let i = 0; i < n; i++) navigateBack();
        };
        const jumpForward = (n: number) => {
            for (let i = 0; i < n; i++) navigateForward();
        };

        const copySgfToClipboard = async () => {
            const sgf = generateSgfFromTree(rootNode);
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
                // Fallback prompt for non-secure contexts.
                text = window.prompt('Paste SGF here:') ?? null;
            }
            if (!text) return;
            try {
                const parsed = parseSgf(text);
                loadGame(parsed);
                toast('Loaded SGF from clipboard.', 'success');
            } catch {
                toast('Failed to parse SGF from clipboard.', 'error');
            }
        };

        // Global shortcuts (KaTrain-like)
        if (ctrl && keyLower === 's') {
            e.preventDefault();
            downloadSgfFromTree(rootNode);
            return;
        }
        if (ctrl && keyLower === 'l') {
            e.preventDefault();
            fileInputRef.current?.click();
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

        if (key === 'Escape') {
            e.preventDefault();
            stopAnalysis();
            return;
        }

        if (key === ' ' || key === 'Spacebar') {
            e.preventDefault();
            toggleContinuousAnalysis(shift);
            return;
        }

        if ((key === 'Backspace' || key === 'Delete') && ctrl) {
            e.preventDefault();
            deleteCurrentNode();
            return;
        }

        if (key === 'Delete' && shift && ctrl) {
            e.preventDefault();
            pruneCurrentBranch();
            return;
        }

        if ((key === 'Backspace' || key === 'Delete') && !ctrl) {
            e.preventDefault();
            navigateBack();
            return;
        }

        if (key === 'Tab') {
            e.preventDefault();
            toggleAnalysisMode();
            return;
        }

        if (key === 'Home') {
            e.preventDefault();
            navigateStart();
            return;
        }
        if (key === 'End') {
            e.preventDefault();
            navigateEnd();
            return;
        }
        if (key === 'PageUp') {
            e.preventDefault();
            makeCurrentNodeMainBranch();
            return;
        }

        if (key === 'ArrowUp') {
            e.preventDefault();
            switchBranch(-1);
            return;
        }
        if (key === 'ArrowDown') {
            e.preventDefault();
            switchBranch(1);
            return;
        }

        if (key === 'ArrowLeft' || keyLower === 'z') {
            e.preventDefault();
            if (ctrl) navigateStart();
            else if (shift) jumpBack(10);
            else navigateBack();
            return;
        }
        if (key === 'ArrowRight' || keyLower === 'x') {
            e.preventDefault();
            if (ctrl) navigateEnd();
            else if (shift) jumpForward(10);
            else navigateForward();
            return;
        }

        if (key === 'Enter') {
            e.preventDefault();
            makeAiMove();
            return;
        }
        if (keyLower === 'p') {
            e.preventDefault();
            passTurn();
            return;
        }
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
            updateSettings({ analysisShowHints: !settings.analysisShowHints });
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
        if (keyLower === 'b') {
            e.preventDefault();
            if (shift) undoToMainBranch();
            else undoToBranchPoint();
            return;
        }
        if (keyLower === 'n') {
            e.preventDefault();
            findMistake(shift ? 'undo' : 'redo');
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
      switchBranch,
      undoToBranchPoint,
      undoToMainBranch,
      makeCurrentNodeMainBranch,
      findMistake,
	      toggleAnalysisMode,
	      resetGame,
	      passTurn,
	      makeAiMove,
	      rootNode,
	      loadGame,
	      settings.showCoordinates,
	      settings.showMoveNumbers,
      settings.analysisShowChildren,
	      settings.analysisShowEval,
	      settings.analysisShowHints,
	      settings.analysisShowPolicy,
	      settings.analysisShowOwnership,
	      toggleContinuousAnalysis,
	      stopAnalysis,
	      updateSettings,
	      deleteCurrentNode,
	      pruneCurrentBranch,
	  ]);

  const handleSave = () => {
      downloadSgfFromTree(rootNode);
  };

  const handleLoadClick = () => {
      fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const text = await file.text();
      try {
          const parsed = parseSgf(text);
          loadGame(parsed);
      } catch (error) {
          console.error("Failed to parse SGF", error);
          alert("Failed to parse SGF file");
      }

      // Reset input
      e.target.value = '';
  };

  const handleAnalysisClick = (move: CandidateMove) => {
      if (move.x === -1 || move.y === -1) {
          passTurn();
      } else {
          playMove(move.x, move.y);
      }
  };

  return (
    <div className="flex h-screen bg-gray-900 text-gray-200 font-sans overflow-hidden">
      {isSettingsOpen && (
          <SettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".sgf"
      />
      {/* Sidebar - Settings and Controls */}
      <div className="w-16 flex flex-col items-center py-4 bg-gray-800 border-r border-gray-700 space-y-6">
        <div className="text-2xl font-bold text-green-500 mb-4">Ka</div>
        <button className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-white" title="New Game" onClick={resetGame}>
          <FaPlay />
        </button>
        <button className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-white" title="Load SGF" onClick={handleLoadClick}>
          <FaFolderOpen />
        </button>
        <button
          className={`p-2 hover:bg-gray-700 rounded ${isAiPlaying ? 'text-green-500' : 'text-gray-400'} hover:text-white`}
          title="Play vs AI (White)"
          onClick={() => toggleAi('white')}
        >
          <FaRobot />
        </button>
        <button
          className={`p-2 hover:bg-gray-700 rounded ${isAnalysisMode ? 'text-blue-500' : 'text-gray-400'} hover:text-white`}
          title="Toggle Analysis Mode"
          onClick={toggleAnalysisMode}
        >
          <FaMicrochip />
        </button>
        <button
          className={`p-2 hover:bg-gray-700 rounded ${isTeachMode ? 'text-purple-500' : 'text-gray-400'} hover:text-white`}
          title="Teach Mode"
          onClick={toggleTeachMode}
        >
          <FaGraduationCap />
        </button>
        <button className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-white" title="Save SGF" onClick={handleSave}>
          <FaSave />
        </button>
        <button
            className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
            title="Settings"
            onClick={() => setIsSettingsOpen(true)}
        >
          <FaCog />
        </button>
        <div className="flex-grow" />
        <button className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-white" title="More">
          <FaEllipsisH />
        </button>
      </div>

      {/* Main Content - Board */}
      <div className="flex-grow flex flex-col relative">
        {/* Top Bar (Status) */}
        <div className="h-12 bg-gray-800 border-b border-gray-700 flex items-center px-4 justify-between select-none">
             <div className="flex items-center space-x-6">
                 {/* Player Indicator */}
                 <div className="flex items-center space-x-2">
                     <div className={`w-4 h-4 rounded-full border ${storeRest.currentPlayer === 'black' ? 'bg-black border-gray-600' : 'bg-white border-gray-400'}`}></div>
                     <span className="font-semibold text-gray-300">{storeRest.currentPlayer === 'black' ? 'Black' : 'White'} to play</span>
                 </div>
                 {/* Move Count */}
                 <div className="text-gray-400 text-sm">
                     Move: <span className="text-white font-mono">{storeRest.moveHistory.length}</span>
                 </div>
                 {/* Captures */}
                 <div className="flex items-center space-x-4 text-sm">
                      <div className="flex items-center space-x-1" title="Prisoners taken by Black">
                          <div className="w-3 h-3 rounded-full bg-white border border-gray-500"></div>
                          <span className="text-gray-400">Captured:</span>
                          <span className="text-white font-mono">{capturedWhite}</span>
                      </div>
                      <div className="flex items-center space-x-1" title="Prisoners taken by White">
                          <div className="w-3 h-3 rounded-full bg-black border border-gray-600"></div>
                          <span className="text-gray-400">Captured:</span>
                          <span className="text-white font-mono">{capturedBlack}</span>
                      </div>
                 </div>
             </div>

             <div className="flex items-center space-x-6">
                 {/* Komi */}
                 <div className="text-gray-400 text-sm">
                     Komi: <span className="text-white font-mono">{storeRest.komi}</span>
                 </div>
                 {/* Timer (Visual) */}
                 <div className="font-mono text-xl text-gray-300 bg-gray-900 px-3 py-1 rounded border border-gray-700">
                     {formatTime(timer)}
                 </div>
             </div>
        </div>

        <div className="flex-grow flex items-center justify-center bg-gray-900 overflow-auto p-4 relative">
           {notification && (
               <div className={`absolute top-4 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded shadow-lg flex items-center space-x-4 animate-bounce-in ${notification.type === 'error' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}`}>
                    <span>{notification.message}</span>
                    <button onClick={clearNotification} className="hover:text-gray-200"><FaTimes /></button>
               </div>
           )}
           <GoBoard
               hoveredMove={hoveredMove}
               onHoverMove={setHoveredMove}
           />
        </div>

        {/* Bottom Control Bar */}
        <div className="h-16 bg-gray-800 border-t border-gray-700 flex items-center px-6 justify-between">
           {/* Left side empty or status text */}
           <div className="text-sm text-gray-500">
               {isAiPlaying ? "AI is active" : "Manual Mode"}
           </div>

           <div className="flex items-center space-x-2">
              <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm font-medium flex items-center" onClick={navigateBack}>
                  <FaArrowLeft className="mr-2"/> Prev
              </button>
              <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm font-medium flex items-center" onClick={navigateForward}>
                  Next <FaArrowRight className="ml-2"/>
              </button>
              <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm font-medium ml-4" onClick={passTurn}>
                  Pass
              </button>
           </div>
        </div>
      </div>

      {/* Right Panel - Analysis & Info */}
      <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
        {isAnalysisMode ? (
            <div className="flex-grow flex flex-col h-full">
                <div className="border-b border-gray-700 p-4">
	                  <h2 className="text-lg font-semibold mb-4 flex items-center">
	                    <FaChartBar className="mr-2" /> Analysis
	                  </h2>
	                  <div className="bg-gray-900 h-32 rounded flex items-center justify-center text-gray-500 overflow-hidden mb-4">
	                     <WinRateGraph />
		                  </div>
		                  <div className="flex flex-wrap gap-2 mb-4">
		                      <button
		                          className={`px-2 py-1 rounded text-xs font-semibold border ${isContinuousAnalysis ? 'bg-gray-700 border-gray-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400'}`}
		                          onClick={() => toggleContinuousAnalysis()}
		                          title="Toggle continuous analysis (Space)"
		                      >
		                          Space Ponder
		                      </button>
		                      <button
		                          className={`px-2 py-1 rounded text-xs font-semibold border ${settings.analysisShowChildren ? 'bg-gray-700 border-gray-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400'}`}
		                          onClick={() => updateSettings({ analysisShowChildren: !settings.analysisShowChildren })}
		                          title="Toggle show children (Q)"
	                      >
	                          Q Children
	                      </button>
	                      <button
	                          className={`px-2 py-1 rounded text-xs font-semibold border ${settings.analysisShowEval ? 'bg-gray-700 border-gray-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400'}`}
	                          onClick={() => updateSettings({ analysisShowEval: !settings.analysisShowEval })}
	                          title="Toggle evaluation dots (W)"
	                      >
	                          W Dots
	                      </button>
	                      <button
	                          className={`px-2 py-1 rounded text-xs font-semibold border ${settings.analysisShowHints ? 'bg-gray-700 border-gray-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400'} ${settings.analysisShowPolicy ? 'opacity-50 cursor-not-allowed' : ''}`}
	                          disabled={settings.analysisShowPolicy}
	                          onClick={() => updateSettings({ analysisShowHints: !settings.analysisShowHints })}
	                          title={settings.analysisShowPolicy ? 'Disabled while Policy is enabled' : 'Toggle top moves (E)'}
	                      >
	                          E Top Moves
	                      </button>
	                      <button
	                          className={`px-2 py-1 rounded text-xs font-semibold border ${settings.analysisShowPolicy ? 'bg-gray-700 border-gray-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400'}`}
	                          onClick={() => updateSettings({ analysisShowPolicy: !settings.analysisShowPolicy })}
	                          title="Toggle policy (R)"
	                      >
	                          R Policy
	                      </button>
	                      <button
	                          className={`px-2 py-1 rounded text-xs font-semibold border ${settings.analysisShowOwnership ? 'bg-gray-700 border-gray-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400'}`}
	                          onClick={() => updateSettings({ analysisShowOwnership: !settings.analysisShowOwnership })}
	                          title="Toggle ownership/territory (T)"
	                      >
	                          T Ownership
	                      </button>
	                  </div>
	                  <div className="space-y-2">
	                    <div className="flex justify-between text-sm">
	                       <span>Win Rate (Black):</span>
	                       <span className={`font-mono ${analysisData && analysisData.rootWinRate > 0.5 ? 'text-green-400' : 'text-red-400'}`}>
	                           {analysisData ? `${(analysisData.rootWinRate * 100).toFixed(1)}%` : '-'}
                       </span>
                    </div>
                    <div className="flex justify-between text-sm">
                       <span>Score Lead:</span>
                       <span className={`font-mono ${analysisData && analysisData.rootScoreLead > 0 ? 'text-blue-400' : 'text-white'}`}>
                           {analysisData ? `${analysisData.rootScoreLead > 0 ? '+' : ''}${analysisData.rootScoreLead.toFixed(1)}` : '-'}
                       </span>
                    </div>
                    <div className="flex justify-between text-sm">
                       <span>Score Stdev:</span>
                       <span className="font-mono text-gray-300">
                           {analysisData && typeof analysisData.rootScoreStdev === 'number' ? analysisData.rootScoreStdev.toFixed(1) : '-'}
                       </span>
                    </div>
                  </div>
                </div>

                {/* Top Moves List */}
                <div className="flex-grow flex flex-col overflow-hidden bg-gray-850">
                   <div className="px-4 py-2 bg-gray-900 border-b border-gray-700 text-xs font-semibold text-gray-400 flex sticky top-0 z-10">
                       <span className="w-6 text-center">#</span>
                       <span className="w-12">Move</span>
                       <span className="w-20 text-center">Win%</span>
                       <span className="w-14 text-right">Score</span>
                       <span className="w-14 text-right">Loss</span>
                       <span className="flex-grow text-right">Visits</span>
                   </div>
                   <div className="overflow-y-auto flex-grow p-0 scrollbar-thin scrollbar-thumb-gray-700">
                       {analysisData ? (
                           analysisData.moves.map((move, i) => {
                               const isPass = move.x === -1 || move.y === -1;
                               const moveLabel = isPass
                                   ? 'Pass'
                                   : `${String.fromCharCode(65 + (move.x >= 8 ? move.x + 1 : move.x))}${19 - move.y}`;

                               return (
                               <div
                                   key={i}
                                   className={`group flex items-center px-4 py-2 text-sm border-b border-gray-700/50 hover:bg-gray-700 cursor-pointer transition-colors ${move.order === 0 ? 'bg-gray-800' : ''}`}
                                   onMouseEnter={() => setHoveredMove(isPass ? null : move)}
                                   onMouseLeave={() => setHoveredMove(null)}
                                   onClick={() => handleAnalysisClick(move)}
                               >
                                   <span className="w-6 text-center font-mono text-gray-500 text-xs mr-2">
                                       {String.fromCharCode(65 + move.order)}
                                   </span>
                                   <span className={`w-12 font-bold font-mono ${move.order===0 ? 'text-blue-400' : (move.pointsLost < 0.5 ? 'text-green-400' : (move.pointsLost < 2 ? 'text-yellow-400' : 'text-red-400'))}`}>
                                       {moveLabel}
                                   </span>

                                   {/* Win Rate Bar */}
                                   <div className="w-20 px-2 flex flex-col justify-center">
                                       <div className="text-right text-xs text-gray-300 font-mono mb-0.5">
                                           {(move.winRate * 100).toFixed(1)}%
                                       </div>
                                       <div className="h-1 bg-gray-600 rounded-full overflow-hidden">
                                           <div
                                               className={`h-full ${move.winRate > 0.5 ? 'bg-green-500' : 'bg-red-500'}`}
                                               style={{ width: `${move.winRate * 100}%` }}
                                           />
                                       </div>
                                   </div>

                                   <span className="w-14 text-right text-gray-300 font-mono">{move.scoreLead > 0 ? '+' : ''}{move.scoreLead.toFixed(1)}</span>
                                   <span className="w-14 text-right text-red-300 font-mono">{move.order === 0 ? '-' : move.pointsLost.toFixed(1)}</span>
                                   <span className="flex-grow text-right text-gray-500 font-mono text-xs">{move.visits.toLocaleString()}</span>
                               </div>
                               );
                           })
                       ) : (
                           <div className="p-4 text-center text-gray-500 text-sm animate-pulse">Processing...</div>
                       )}
                   </div>
                </div>
            </div>
        ) : (
            /* Normal Game Info when not analyzing */
            <div className="h-full p-4 flex flex-col">
               <h2 className="text-lg font-semibold mb-2">Move Tree</h2>
               <div className="flex-grow bg-gray-900 rounded overflow-hidden border border-gray-700">
                  <MoveTree />
               </div>
               <div className="mt-2 text-[11px] text-gray-500">
                  z/← undo · x/→ redo · ↑/↓ switch branch · Ctrl+Delete delete · Ctrl+Shift+Delete prune
               </div>
            </div>
        )}
      </div>
    </div>
  );
};
