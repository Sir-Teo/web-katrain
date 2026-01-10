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

                    {/* Move Numbers */}
                    <div className="flex items-center justify-between">
                        <label className="text-gray-300">Show Move Numbers</label>
                        <input
                            type="checkbox"
                            checked={settings.showMoveNumbers}
                            onChange={(e) => updateSettings({ showMoveNumbers: e.target.checked })}
                            className="toggle"
                        />
                    </div>

                    <div className="pt-2 border-t border-gray-700">
                        <h3 className="text-sm font-semibold text-gray-200 mb-3">Analysis Overlays</h3>

                        <div className="flex items-center justify-between">
                            <label className="text-gray-300">Show Children (Q)</label>
                            <input
                                type="checkbox"
                                checked={settings.analysisShowChildren}
                                onChange={(e) => updateSettings({ analysisShowChildren: e.target.checked })}
                                className="toggle"
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <label className="text-gray-300">Evaluation Dots (W)</label>
                            <input
                                type="checkbox"
                                checked={settings.analysisShowEval}
                                onChange={(e) => updateSettings({ analysisShowEval: e.target.checked })}
                                className="toggle"
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <label className="text-gray-300">Top Moves (Hints) (E)</label>
                            <input
                                type="checkbox"
                                checked={settings.analysisShowHints}
                                onChange={(e) => updateSettings({ analysisShowHints: e.target.checked })}
                                className="toggle"
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <label className="text-gray-300">Policy (R)</label>
                            <input
                                type="checkbox"
                                checked={settings.analysisShowPolicy}
                                onChange={(e) => updateSettings({ analysisShowPolicy: e.target.checked })}
                                className="toggle"
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <label className="text-gray-300">Ownership (Territory) (T)</label>
                            <input
                                type="checkbox"
                                checked={settings.analysisShowOwnership}
                                onChange={(e) => updateSettings({ analysisShowOwnership: e.target.checked })}
                                className="toggle"
                            />
                        </div>
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
                         <label className="text-gray-300 block">Show Last N Eval Dots</label>
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
                             Shows KaTrain-style colored dots on the last {settings.showLastNMistakes} moves.
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
                                 value={settings.mistakeThreshold ?? 3.0}
                                 onChange={(e) => updateSettings({ mistakeThreshold: parseFloat(e.target.value) })}
                                 className="flex-grow"
                             />
                             <span className="text-white font-mono w-8 text-right">{(settings.mistakeThreshold ?? 3.0).toFixed(1)}</span>
                         </div>
                         <p className="text-xs text-gray-500">
                             Minimum points lost to consider a move a mistake for navigation.
                         </p>
                    </div>

                    <div className="pt-2 border-t border-gray-700">
                        <h3 className="text-sm font-semibold text-gray-200 mb-2">Teach Mode</h3>
                        <p className="text-xs text-gray-500 mb-3">
                            KaTrain-style auto-undo after analysis based on points lost. Values &lt; 1 are treated as a probability; values ≥ 1 are
                            treated as a max variation count.
                        </p>

                        <div className="grid grid-cols-3 gap-3">
                            {[12, 6, 3, 1.5, 0.5, 0].map((thr, i) => (
                                <div key={thr} className="space-y-1">
                                    <label className="text-gray-300 block text-sm">≥ {thr}</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step={0.1}
                                        value={settings.teachNumUndoPrompts?.[i] ?? 0}
                                        onChange={(e) => {
                                            const v = Math.max(0, parseFloat(e.target.value || '0'));
                                            const next = [...(settings.teachNumUndoPrompts ?? [])];
                                            next[i] = v;
                                            updateSettings({ teachNumUndoPrompts: next });
                                        }}
                                        className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="pt-2 border-t border-gray-700">
                        <h3 className="text-sm font-semibold text-gray-200 mb-3">AI</h3>

                        <div className="space-y-2">
                            <label className="text-gray-300 block">Strategy</label>
                            <select
                                value={settings.aiStrategy}
                                onChange={(e) => updateSettings({ aiStrategy: e.target.value as GameSettings['aiStrategy'] })}
                                className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm"
                            >
                                <option value="default">Default (engine top move)</option>
                                <option value="scoreloss">ScoreLoss (weaker)</option>
                                <option value="policy">Policy</option>
                                <option value="weighted">Policy Weighted</option>
                                <option value="rank">Rank (KaTrain)</option>
                            </select>
                        </div>

                        {settings.aiStrategy === 'rank' && (
                            <div className="mt-3 space-y-1">
                                <label className="text-gray-300 block text-sm">Kyu Rank</label>
                                <input
                                    type="number"
                                    step={0.5}
                                    value={settings.aiRankKyu}
                                    onChange={(e) => updateSettings({ aiRankKyu: parseFloat(e.target.value || '0') })}
                                    className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                />
                                <p className="text-xs text-gray-500">
                                    KaTrain’s calibrated rank-based policy picking (e.g. 4 = 4k, 0 = 1d, -3 = 4d).
                                </p>
                            </div>
                        )}

                        {settings.aiStrategy === 'scoreloss' && (
                            <div className="mt-3 space-y-1">
                                <label className="text-gray-300 block text-sm">Strength (c)</label>
                                <input
                                    type="number"
                                    min={0}
                                    step={0.05}
                                    value={settings.aiScoreLossStrength}
                                    onChange={(e) => updateSettings({ aiScoreLossStrength: Math.max(0, parseFloat(e.target.value || '0')) })}
                                    className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                />
                                <p className="text-xs text-gray-500">
                                    Higher = plays closer to best move; lower = more random among worse moves.
                                </p>
                            </div>
                        )}

                        {settings.aiStrategy === 'policy' && (
                            <div className="mt-3 space-y-1">
                                <label className="text-gray-300 block text-sm">Opening Moves</label>
                                <input
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={settings.aiPolicyOpeningMoves}
                                    onChange={(e) => updateSettings({ aiPolicyOpeningMoves: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                                    className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                />
                                <p className="text-xs text-gray-500">
                                    For the first N moves, uses weighted policy sampling (KaTrain-like).
                                </p>
                            </div>
                        )}

                        {settings.aiStrategy === 'weighted' && (
                            <div className="mt-3 grid grid-cols-3 gap-3">
                                <div className="space-y-1">
                                    <label className="text-gray-300 block text-sm">Override</label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={1}
                                        step={0.01}
                                        value={settings.aiWeightedPickOverride}
                                        onChange={(e) => updateSettings({ aiWeightedPickOverride: Math.max(0, Math.min(1, parseFloat(e.target.value || '0'))) })}
                                        className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-gray-300 block text-sm">Weaken</label>
                                    <input
                                        type="number"
                                        min={0.01}
                                        step={0.05}
                                        value={settings.aiWeightedWeakenFac}
                                        onChange={(e) => updateSettings({ aiWeightedWeakenFac: Math.max(0.01, parseFloat(e.target.value || '0')) })}
                                        className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-gray-300 block text-sm">Lower</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step={0.001}
                                        value={settings.aiWeightedLowerBound}
                                        onChange={(e) => updateSettings({ aiWeightedLowerBound: Math.max(0, parseFloat(e.target.value || '0')) })}
                                        className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                    />
                                </div>
                                <div className="col-span-3 text-xs text-gray-500">
                                    Samples moves with probability proportional to <span className="font-mono">policy^(1/weaken)</span> above <span className="font-mono">lower</span>, unless the top policy move exceeds <span className="font-mono">override</span>.
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="pt-2 border-t border-gray-700">
                        <h3 className="text-sm font-semibold text-gray-200 mb-3">KataGo</h3>

                        <div className="space-y-2">
                            <label className="text-gray-300 block">Model URL</label>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs font-mono text-white border border-gray-600"
                                    onClick={() => updateSettings({ katagoModelUrl: '/models/kata1-b18c384nbt-s9996604416-d4316597426.bin.gz' })}
                                    title="KaTrain default weights"
                                >
                                    KaTrain Default
                                </button>
                                <button
                                    type="button"
                                    className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs font-mono text-white border border-gray-600"
                                    onClick={() => updateSettings({ katagoModelUrl: '/models/katago-small.bin.gz' })}
                                    title="Small KataGo test model"
                                >
                                    Small Test
                                </button>
                            </div>
                            <input
                                type="text"
                                value={settings.katagoModelUrl}
                                onChange={(e) => updateSettings({ katagoModelUrl: e.target.value })}
                                className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-xs font-mono"
                                placeholder="/models/kata1-b18c384nbt-s9996604416-d4316597426.bin.gz"
                            />
                            <p className="text-xs text-gray-500">
                                Use a local path under <span className="font-mono">/models/</span> or a full URL (must allow CORS).
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mt-4">
                            <div className="space-y-1">
                                <label className="text-gray-300 block text-sm">Visits</label>
                                <input
                                    type="number"
                                    min={16}
                                    max={5000}
                                    value={settings.katagoVisits}
                                    onChange={(e) => updateSettings({ katagoVisits: Math.max(16, parseInt(e.target.value || '0', 10)) })}
                                    className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-gray-300 block text-sm">Max Time (ms)</label>
                                <input
                                    type="number"
                                    min={25}
                                    max={60000}
                                    value={settings.katagoMaxTimeMs}
                                    onChange={(e) => updateSettings({ katagoMaxTimeMs: Math.max(25, parseInt(e.target.value || '0', 10)) })}
                                    className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-gray-300 block text-sm">Batch Size</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={64}
                                    value={settings.katagoBatchSize}
                                    onChange={(e) => updateSettings({ katagoBatchSize: Math.max(1, parseInt(e.target.value || '0', 10)) })}
                                    className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-gray-300 block text-sm">Max Children</label>
                                <input
                                    type="number"
                                    min={4}
                                    max={361}
                                    value={settings.katagoMaxChildren}
                                    onChange={(e) => updateSettings({ katagoMaxChildren: Math.max(4, parseInt(e.target.value || '0', 10)) })}
                                    className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                />
                            </div>
                        </div>

                        <div className="mt-3 space-y-1">
                            <label className="text-gray-300 block text-sm">Top Moves</label>
                            <input
                                type="number"
                                min={1}
                                max={50}
                                value={settings.katagoTopK}
                                onChange={(e) => updateSettings({ katagoTopK: Math.max(1, parseInt(e.target.value || '0', 10)) })}
                                className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                            />
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-gray-300 block text-sm">Ownership</label>
                                <select
                                    value={settings.katagoOwnershipMode}
                                    onChange={(e) => updateSettings({ katagoOwnershipMode: e.target.value as 'root' | 'tree' })}
                                    className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm"
                                >
                                    <option value="root">Root-only (faster)</option>
                                    <option value="tree">Tree-averaged (slower)</option>
                                </select>
                                <p className="text-xs text-gray-500">
                                    Root-only matches KaTrain and avoids expensive per-node ownership reads.
                                </p>
                            </div>
                            <div className="space-y-1">
                                <label className="text-gray-300 block text-sm">Reuse Search Tree</label>
                                <label className="flex items-center space-x-2 text-sm text-gray-300">
                                    <input
                                        type="checkbox"
                                        checked={settings.katagoReuseTree}
                                        onChange={(e) => updateSettings({ katagoReuseTree: e.target.checked })}
                                        className="rounded"
                                    />
                                    <span>Enable (faster)</span>
                                </label>
                                <p className="text-xs text-gray-500">
                                    Speeds up continuous analysis by continuing from previous visits.
                                </p>
                            </div>
                        </div>
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
