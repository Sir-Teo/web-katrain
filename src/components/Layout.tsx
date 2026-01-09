import React from 'react';
import { useGameStore } from '../store/gameStore';
import { GoBoard } from './GoBoard';
import { FaPlay, FaCog, FaChartBar, FaEllipsisH, FaRobot, FaUndo, FaSave, FaFolderOpen } from 'react-icons/fa';
import { downloadSgf, parseSgf } from '../utils/sgf';
import type { GameState } from '../types';

export const Layout: React.FC = () => {
  const { resetGame, passTurn, capturedBlack, capturedWhite, toggleAi, isAiPlaying, undoMove, loadGame, ...storeRest } = useGameStore();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleSave = () => {
      // Reconstruct simple GameState
      const gameState: GameState = {
          board: storeRest.board,
          currentPlayer: storeRest.currentPlayer,
          moveHistory: storeRest.moveHistory,
          capturedBlack: capturedBlack,
          capturedWhite: capturedWhite,
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

  return (
    <div className="flex h-screen bg-gray-900 text-gray-200 font-sans overflow-hidden">
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
        <button className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-white" title="Save SGF" onClick={handleSave}>
          <FaSave />
        </button>
        <button className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-white" title="Settings">
          <FaCog />
        </button>
        <div className="flex-grow" />
        <button className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-white" title="More">
          <FaEllipsisH />
        </button>
      </div>

      {/* Main Content - Board */}
      <div className="flex-grow flex flex-col relative">
        {/* Top Bar (Optional status) */}

        <div className="flex-grow flex items-center justify-center bg-gray-900 overflow-auto p-4">
           <GoBoard />
        </div>

        {/* Bottom Control Bar */}
        <div className="h-16 bg-gray-800 border-t border-gray-700 flex items-center px-6 justify-between">
           <div className="flex items-center space-x-4">
              <div className="text-sm">
                 <span className="text-gray-400">Black Captures:</span> <span className="text-white font-mono">{capturedBlack}</span>
              </div>
              <div className="text-sm">
                 <span className="text-gray-400">White Captures:</span> <span className="text-white font-mono">{capturedWhite}</span>
              </div>
           </div>

           <div className="flex items-center space-x-2">
              <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm font-medium flex items-center" onClick={undoMove}>
                  <FaUndo className="mr-2"/> Undo
              </button>
              <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm font-medium" onClick={passTurn}>
                  Pass
              </button>
           </div>
        </div>
      </div>

      {/* Right Panel - Analysis & Info */}
      <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
        <div className="h-1/2 border-b border-gray-700 p-4">
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <FaChartBar className="mr-2" /> Analysis
          </h2>
          <div className="bg-gray-900 h-40 rounded flex items-center justify-center text-gray-500">
             Win Rate Graph Placeholder
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-sm">
               <span>Win Rate (Black):</span>
               <span className="text-green-400">50.0%</span>
            </div>
            <div className="flex justify-between text-sm">
               <span>Score Lead:</span>
               <span className="text-blue-400">+0.0</span>
            </div>
             <div className="flex justify-between text-sm">
               <span>Visits:</span>
               <span className="text-yellow-400">0</span>
            </div>
          </div>
        </div>
        <div className="h-1/2 p-4 flex flex-col">
           <h2 className="text-lg font-semibold mb-2">Move Info</h2>
           <div className="flex-grow bg-gray-900 rounded p-2 text-sm font-mono overflow-y-auto">
              {/* Move list or comments */}
              <div>Game started.</div>
              {storeRest.moveHistory.map((move, i) => (
                  <div key={i}>
                      {i + 1}. {move.player} ({move.x === -1 ? 'Pass' : `${String.fromCharCode(65 + (move.x >= 8 ? move.x + 1 : move.x))}${19 - move.y}`})
                  </div>
              ))}
           </div>
        </div>
      </div>
    </div>
  );
};
