import React from 'react';
import { useGameStore } from '../store/gameStore';
import { FaTimes } from 'react-icons/fa';
import type { GameSettings } from '../types';

interface SettingsModalProps {
    onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
    const { settings, updateSettings } = useGameStore();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-gray-800 rounded-lg shadow-xl w-96 overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <h2 className="text-lg font-semibold text-white">Settings</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <FaTimes />
                    </button>
                </div>
                <div className="p-4 space-y-4">
                    {/* Sound */}
                    <div className="flex items-center justify-between">
                        <label className="text-gray-300">Sound Effects</label>
                        <input
                            type="checkbox"
                            checked={settings.soundEnabled}
                            onChange={(e) => updateSettings({ soundEnabled: e.target.checked })}
                            className="toggle"
                        />
                    </div>

                    {/* Coordinates */}
                    <div className="flex items-center justify-between">
                        <label className="text-gray-300">Show Coordinates</label>
                        <input
                            type="checkbox"
                            checked={settings.showCoordinates}
                            onChange={(e) => updateSettings({ showCoordinates: e.target.checked })}
                            className="toggle"
                        />
                    </div>

                    {/* Territory */}
                    <div className="flex items-center justify-between">
                        <label className="text-gray-300">Show Territory (Analysis)</label>
                        <input
                            type="checkbox"
                            checked={settings.showTerritory}
                            onChange={(e) => updateSettings({ showTerritory: e.target.checked })}
                            className="toggle"
                        />
                    </div>

                    {/* Board Theme */}
                    <div className="space-y-2">
                        <label className="text-gray-300 block">Board Theme</label>
                        <select
                            value={settings.boardTheme}
                            onChange={(e) => updateSettings({ boardTheme: e.target.value as GameSettings['boardTheme'] })}
                            className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none"
                        >
                            <option value="bamboo">Bamboo (Classic)</option>
                            <option value="flat">Flat Color</option>
                            <option value="dark">Dark Mode</option>
                        </select>
                    </div>

                    {/* Show Last N Mistakes */}
                    <div className="space-y-2">
                         <label className="text-gray-300 block">Show Last N Mistakes</label>
                         <div className="flex items-center space-x-2">
                             <input
                                 type="range"
                                 min="0"
                                 max="10"
                                 value={settings.showLastNMistakes}
                                 onChange={(e) => updateSettings({ showLastNMistakes: parseInt(e.target.value) })}
                                 className="flex-grow"
                             />
                             <span className="text-white font-mono w-6 text-right">{settings.showLastNMistakes}</span>
                         </div>
                         <p className="text-xs text-gray-500">
                             Shows colored dots on the last {settings.showLastNMistakes} moves indicating points lost.
                         </p>
                    </div>

                    {/* Mistake Threshold */}
                    <div className="space-y-2">
                         <label className="text-gray-300 block">Mistake Threshold (Points)</label>
                         <div className="flex items-center space-x-2">
                             <input
                                 type="range"
                                 min="0.5"
                                 max="10"
                                 step="0.5"
                                 value={settings.mistakeThreshold ?? 2.0}
                                 onChange={(e) => updateSettings({ mistakeThreshold: parseFloat(e.target.value) })}
                                 className="flex-grow"
                             />
                             <span className="text-white font-mono w-8 text-right">{(settings.mistakeThreshold ?? 2.0).toFixed(1)}</span>
                         </div>
                         <p className="text-xs text-gray-500">
                             Minimum points lost to consider a move a mistake for navigation.
                         </p>
                    </div>
                </div>
                <div className="p-4 bg-gray-900 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded font-medium"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};
