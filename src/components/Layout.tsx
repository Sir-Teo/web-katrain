import React, { useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { GoBoard } from './GoBoard';
import { WinRateGraph } from './WinRateGraph';
import { SettingsModal } from './SettingsModal';
import { FaPlay, FaCog, FaChartBar, FaEllipsisH, FaRobot, FaArrowLeft, FaArrowRight, FaSave, FaFolderOpen, FaMicrochip, FaGraduationCap, FaTimes } from 'react-icons/fa';
import { downloadSgf, parseSgf } from '../utils/sgf';
import type { GameState, CandidateMove } from '../types';

export const Layout: React.FC = () => {
  const {
    resetGame,
    passTurn,
    capturedBlack,
    capturedWhite,
    toggleAi,
    isAiPlaying,
    navigateBack,
    navigateForward,
    navigateStart,
    navigateEnd,
    navigateNextMistake,
    navigatePrevMistake,
    loadGame,
    toggleAnalysisMode,
    isAnalysisMode,
    toggleTeachMode,
    isTeachMode,
    notification,
    clearNotification,
    analysisData,
    playMove,
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
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'ArrowLeft') {
            navigateBack();
        } else if (e.key === 'ArrowRight') {
            navigateForward();
        } else if (e.key === 'ArrowUp' || e.key === 'Home') {
            navigateStart();
        } else if (e.key === 'ArrowDown' || e.key === 'End') {
            navigateEnd();
        } else if (e.key === 'Backspace' || e.key === 'Delete') {
             // If input focused, don't trigger
             if (document.activeElement?.tagName === 'INPUT') return;
             navigateBack();
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigateBack, navigateForward, navigateStart, navigateEnd]);

  const handleSave = () => {
      // Reconstruct simple GameState
      const gameState: GameState = {
          board: storeRest.board,
          currentPlayer: storeRest.currentPlayer,
          moveHistory: storeRest.moveHistory,
          capturedBlack: capturedBlack,
          capturedWhite: capturedWhite,
          komi: storeRest.komi,
      };
      downloadSgf(gameState);
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
      playMove(move.x, move.y);
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
              <button className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm font-medium flex items-center" onClick={navigatePrevMistake} title="Previous Mistake (Shift+N)">
                  <span className="text-red-400 font-bold mr-1">Mistake</span> <FaArrowLeft />
              </button>
              <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm font-medium flex items-center" onClick={navigateBack}>
                  <FaArrowLeft className="mr-2"/> Prev
              </button>
              <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm font-medium flex items-center" onClick={navigateForward}>
                  Next <FaArrowRight className="ml-2"/>
              </button>
              <button className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm font-medium flex items-center" onClick={navigateNextMistake} title="Next Mistake (N)">
                  <FaArrowRight className="mr-1"/> <span className="text-red-400 font-bold">Mistake</span>
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
                           analysisData.moves.map((move, i) => (
                               <div
                                   key={i}
                                   className={`group flex items-center px-4 py-2 text-sm border-b border-gray-700/50 hover:bg-gray-700 cursor-pointer transition-colors ${move.order === 0 ? 'bg-gray-800' : ''}`}
                                   onMouseEnter={() => setHoveredMove(move)}
                                   onMouseLeave={() => setHoveredMove(null)}
                                   onClick={() => handleAnalysisClick(move)}
                               >
                                   <span className="w-6 text-center font-mono text-gray-500 text-xs mr-2">
                                       {String.fromCharCode(65 + move.order)}
                                   </span>
                                   <span className={`w-12 font-bold font-mono ${move.order===0 ? 'text-blue-400' : (move.pointsLost < 0.5 ? 'text-green-400' : (move.pointsLost < 2 ? 'text-yellow-400' : 'text-red-400'))}`}>
                                       {String.fromCharCode(65 + (move.x >= 8 ? move.x + 1 : move.x))}{19 - move.y}
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
                           ))
                       ) : (
                           <div className="p-4 text-center text-gray-500 text-sm animate-pulse">Processing...</div>
                       )}
                   </div>
                </div>
            </div>
        ) : (
            /* Normal Game Info when not analyzing */
            <div className="h-full p-4 flex flex-col">
               <h2 className="text-lg font-semibold mb-2">Move History</h2>
               <div className="flex-grow bg-gray-900 rounded p-2 text-sm font-mono overflow-y-auto">
                  <div>Game started.</div>
                  {storeRest.moveHistory.map((move, i) => (
                      <div key={i}>
                          {i + 1}. {move.player} ({move.x === -1 ? 'Pass' : `${String.fromCharCode(65 + (move.x >= 8 ? move.x + 1 : move.x))}${19 - move.y}`})
                      </div>
                  ))}
               </div>
            </div>
        )}
      </div>
    </div>
  );
};
