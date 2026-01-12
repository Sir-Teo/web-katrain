import React from 'react';
import { useGameStore } from '../store/gameStore';
import { FaTimes } from 'react-icons/fa';
import type { GameSettings } from '../types';
import { ENGINE_MAX_TIME_MS, ENGINE_MAX_VISITS } from '../engine/katago/limits';

interface SettingsModalProps {
    onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
    const { settings, updateSettings, engineBackend, engineModelName } = useGameStore();
    const DEFAULT_EVAL_THRESHOLDS = [12, 6, 3, 1.5, 0.5, 0];
    const DEFAULT_SHOW_DOTS = [true, true, true, true, true, true];
    const DEFAULT_SAVE_FEEDBACK = [true, true, true, true, false, false];

    const TOP_MOVE_OPTIONS: Array<{ value: GameSettings['trainerTopMovesShow']; label: string }> = [
        { value: 'top_move_delta_score', label: 'Δ Score (points lost)' },
        { value: 'top_move_visits', label: 'Visits' },
        { value: 'top_move_score', label: 'Score' },
        { value: 'top_move_winrate', label: 'Winrate' },
        { value: 'top_move_delta_winrate', label: 'Δ Winrate' },
        { value: 'top_move_nothing', label: 'Nothing' },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-gray-800 rounded-lg shadow-xl w-96 max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <h2 className="text-lg font-semibold text-white">Settings</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <FaTimes />
                    </button>
                </div>
                <div className="p-4 space-y-4 overflow-y-auto">
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

                    <div className="pt-2 border-t border-gray-700">
                        <h3 className="text-sm font-semibold text-gray-200 mb-3">Timer</h3>

                        <div className="flex items-center justify-between">
                            <label className="text-gray-300">Timer Sound</label>
                            <input
                                type="checkbox"
                                checked={settings.timerSound}
                                onChange={(e) => updateSettings({ timerSound: e.target.checked })}
                                className="toggle"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3 mt-3">
                            <div className="space-y-1">
                                <label className="text-gray-300 block text-sm">Main Time (min)</label>
                                <input
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={settings.timerMainTimeMinutes}
                                    onChange={(e) => updateSettings({ timerMainTimeMinutes: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                                    className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-gray-300 block text-sm">Byo Length (sec)</label>
                                <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    value={settings.timerByoLengthSeconds}
                                    onChange={(e) => updateSettings({ timerByoLengthSeconds: Math.max(1, parseInt(e.target.value || '1', 10)) })}
                                    className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-gray-300 block text-sm">Byo Periods</label>
                                <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    value={settings.timerByoPeriods}
                                    onChange={(e) => updateSettings({ timerByoPeriods: Math.max(1, parseInt(e.target.value || '1', 10)) })}
                                    className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-gray-300 block text-sm">Minimal Use (sec)</label>
                                <input
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={settings.timerMinimalUseSeconds}
                                    onChange={(e) => updateSettings({ timerMinimalUseSeconds: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                                    className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                />
                            </div>
                        </div>

                        <p className="text-xs text-gray-500 mt-2">
                            KaTrain-style clock (main time, then byo-yomi periods). Timer runs only in Play mode and only for human turns.
                        </p>
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

                    {/* SGF Load */}
                    <div className="flex items-center justify-between">
                        <label className="text-gray-300">Load SGF Rewind</label>
                        <input
                            type="checkbox"
                            checked={settings.loadSgfRewind}
                            onChange={(e) => updateSettings({ loadSgfRewind: e.target.checked })}
                            className="toggle"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-gray-300 block text-sm">Rules</label>
                        <select
                            value={settings.gameRules}
                            onChange={(e) => updateSettings({ gameRules: e.target.value as GameSettings['gameRules'] })}
                            className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm"
                        >
                            <option value="japanese">Japanese (KaTrain default)</option>
                            <option value="chinese">Chinese</option>
                            <option value="korean">Korean</option>
                        </select>
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

                        <div className="pt-3 border-t border-gray-700 space-y-3">
                            <h4 className="text-xs font-semibold text-gray-300 tracking-wide">KaTrain Hint Labels</h4>

                            <div className="space-y-1">
                                <label className="text-gray-300 block text-sm">Low Visits Threshold</label>
                                <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    value={settings.trainerLowVisits}
                                    onChange={(e) => updateSettings({ trainerLowVisits: Math.max(1, parseInt(e.target.value || '1', 10)) })}
                                    className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-gray-300 block text-sm">Primary Label</label>
                                <select
                                    value={settings.trainerTopMovesShow}
                                    onChange={(e) => updateSettings({ trainerTopMovesShow: e.target.value as GameSettings['trainerTopMovesShow'] })}
                                    className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm"
                                >
                                    {TOP_MOVE_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-gray-300 block text-sm">Secondary Label</label>
                                <select
                                    value={settings.trainerTopMovesShowSecondary}
                                    onChange={(e) =>
                                        updateSettings({ trainerTopMovesShowSecondary: e.target.value as GameSettings['trainerTopMovesShowSecondary'] })
                                    }
                                    className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm"
                                >
                                    {TOP_MOVE_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex items-center justify-between">
                                <label className="text-gray-300">Extra Precision</label>
                                <input
                                    type="checkbox"
                                    checked={settings.trainerExtraPrecision}
                                    onChange={(e) => updateSettings({ trainerExtraPrecision: e.target.checked })}
                                    className="toggle"
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <label className="text-gray-300">Show AI Dots</label>
                                <input
                                    type="checkbox"
                                    checked={settings.trainerEvalShowAi}
                                    onChange={(e) => updateSettings({ trainerEvalShowAi: e.target.checked })}
                                    className="toggle"
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <label className="text-gray-300">Cache analysis to SGF</label>
                                <input
                                    type="checkbox"
                                    checked={settings.trainerSaveAnalysis}
                                    onChange={(e) => updateSettings({ trainerSaveAnalysis: e.target.checked })}
                                    className="toggle"
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <label className="text-gray-300">Save SGF marks (X / square)</label>
                                <input
                                    type="checkbox"
                                    checked={settings.trainerSaveMarks}
                                    onChange={(e) => updateSettings({ trainerSaveMarks: e.target.checked })}
                                    className="toggle"
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <label className="text-gray-300">Lock AI details (Play mode)</label>
                                <input
                                    type="checkbox"
                                    checked={settings.trainerLockAi}
                                    onChange={(e) => updateSettings({ trainerLockAi: e.target.checked })}
                                    className="toggle"
                                />
                            </div>
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

                        <div className="space-y-2">
                            {DEFAULT_EVAL_THRESHOLDS.map((fallbackThr, i) => {
                                const thr = settings.trainerEvalThresholds?.[i] ?? fallbackThr;
                                const undo = settings.teachNumUndoPrompts?.[i] ?? 0;
                                const showDot = settings.trainerShowDots?.[i] ?? true;
                                const saveFeedback = settings.trainerSaveFeedback?.[i] ?? false;

                                return (
                                    <div key={`teach-${i}`} className="grid grid-cols-4 gap-2 items-center">
                                        <div className="space-y-1">
                                            <label className="text-gray-300 block text-xs">≥ Threshold</label>
                                            <input
                                                type="number"
                                                step={0.1}
                                                value={thr}
                                                onChange={(e) => {
                                                    const v = parseFloat(e.target.value || '0');
                                                    const next = [...(settings.trainerEvalThresholds ?? DEFAULT_EVAL_THRESHOLDS)];
                                                    next[i] = v;
                                                    updateSettings({ trainerEvalThresholds: next });
                                                }}
                                                className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-gray-300 block text-xs">Undo</label>
                                            <input
                                                type="number"
                                                min={0}
                                                step={0.1}
                                                value={undo}
                                                onChange={(e) => {
                                                    const v = Math.max(0, parseFloat(e.target.value || '0'));
                                                    const next = [...(settings.teachNumUndoPrompts ?? [])];
                                                    next[i] = v;
                                                    updateSettings({ teachNumUndoPrompts: next });
                                                }}
                                                className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                            />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <label className="text-gray-300 text-xs">Show dots</label>
                                            <input
                                                type="checkbox"
                                                checked={showDot}
                                                onChange={(e) => {
                                                    const next = [
                                                        ...(settings.trainerShowDots?.length ? settings.trainerShowDots : DEFAULT_SHOW_DOTS),
                                                    ];
                                                    next[i] = e.target.checked;
                                                    updateSettings({ trainerShowDots: next });
                                                }}
                                                className="toggle"
                                            />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <label className="text-gray-300 text-xs">Save SGF</label>
                                            <input
                                                type="checkbox"
                                                checked={saveFeedback}
                                                onChange={(e) => {
                                                    const next = [
                                                        ...(settings.trainerSaveFeedback?.length ? settings.trainerSaveFeedback : DEFAULT_SAVE_FEEDBACK),
                                                    ];
                                                    next[i] = e.target.checked;
                                                    updateSettings({ trainerSaveFeedback: next });
                                                }}
                                                className="toggle"
                                            />
                                        </div>
                                    </div>
                                );
                            })}

                            <p className="text-xs text-gray-500">
                                Matches KaTrain’s teacher config: thresholds define dot color classes; “Save SGF” controls auto-feedback comments.
                            </p>
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
                                <option value="rank">Rank (KaTrain)</option>
                                <option value="simple">Simple Ownership (KaTrain)</option>
                                <option value="settle">Settle Stones (KaTrain)</option>
                                <option value="scoreloss">ScoreLoss (weaker)</option>
                                <option value="policy">Policy</option>
                                <option value="weighted">Policy Weighted</option>
                                <option value="jigo">Jigo (KaTrain)</option>
                                <option value="pick">Pick (KaTrain)</option>
                                <option value="local">Local (KaTrain)</option>
                                <option value="tenuki">Tenuki (KaTrain)</option>
                                <option value="territory">Territory (KaTrain)</option>
                                <option value="influence">Influence (KaTrain)</option>
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

                        {settings.aiStrategy === 'jigo' && (
                            <div className="mt-3 space-y-1">
                                <label className="text-gray-300 block text-sm">Target Score</label>
                                <input
                                    type="number"
                                    step={0.1}
                                    value={settings.aiJigoTargetScore}
                                    onChange={(e) => updateSettings({ aiJigoTargetScore: parseFloat(e.target.value || '0') })}
                                    className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                />
                                <p className="text-xs text-gray-500">
                                    Chooses the move whose <span className="font-mono">scoreLead</span> is closest to this (for the side to play).
                                </p>
                            </div>
                        )}

                        {(settings.aiStrategy === 'simple' || settings.aiStrategy === 'settle') && (
                            <div className="mt-3 grid grid-cols-3 gap-3">
                                <div className="space-y-1">
                                    <label className="text-gray-300 block text-sm">Max Pt Lost</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step={0.25}
                                        value={settings.aiOwnershipMaxPointsLost}
                                        onChange={(e) => updateSettings({ aiOwnershipMaxPointsLost: Math.max(0, parseFloat(e.target.value || '0')) })}
                                        className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-gray-300 block text-sm">Settled Wt</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step={0.25}
                                        value={settings.aiOwnershipSettledWeight}
                                        onChange={(e) => updateSettings({ aiOwnershipSettledWeight: Math.max(0, parseFloat(e.target.value || '0')) })}
                                        className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-gray-300 block text-sm">Opp Fac</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step={0.1}
                                        value={settings.aiOwnershipOpponentFac}
                                        onChange={(e) => updateSettings({ aiOwnershipOpponentFac: Math.max(0, parseFloat(e.target.value || '0')) })}
                                        className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-gray-300 block text-sm">Min Visits</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={settings.aiOwnershipMinVisits}
                                        onChange={(e) => updateSettings({ aiOwnershipMinVisits: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                                        className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-gray-300 block text-sm">Attach Pen</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step={0.25}
                                        value={settings.aiOwnershipAttachPenalty}
                                        onChange={(e) => updateSettings({ aiOwnershipAttachPenalty: Math.max(0, parseFloat(e.target.value || '0')) })}
                                        className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-gray-300 block text-sm">Tenuki Pen</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step={0.25}
                                        value={settings.aiOwnershipTenukiPenalty}
                                        onChange={(e) => updateSettings({ aiOwnershipTenukiPenalty: Math.max(0, parseFloat(e.target.value || '0')) })}
                                        className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                    />
                                </div>
                                <div className="col-span-3 text-xs text-gray-500">
                                    KaTrain {settings.aiStrategy}: uses per-move ownership (slower) to favor “settled” outcomes.
                                </div>
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

                        {settings.aiStrategy === 'pick' && (
                            <div className="mt-3 grid grid-cols-3 gap-3">
                                <div className="space-y-1">
                                    <label className="text-gray-300 block text-sm">Override</label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={1}
                                        step={0.01}
                                        value={settings.aiPickPickOverride}
                                        onChange={(e) => updateSettings({ aiPickPickOverride: Math.max(0, Math.min(1, parseFloat(e.target.value || '0'))) })}
                                        className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-gray-300 block text-sm">Pick N</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={settings.aiPickPickN}
                                        onChange={(e) => updateSettings({ aiPickPickN: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                                        className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-gray-300 block text-sm">Pick Frac</label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={1}
                                        step={0.05}
                                        value={settings.aiPickPickFrac}
                                        onChange={(e) => updateSettings({ aiPickPickFrac: Math.max(0, Math.min(1, parseFloat(e.target.value || '0'))) })}
                                        className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                    />
                                </div>
                                <div className="col-span-3 text-xs text-gray-500">
                                    KaTrain pick-based policy: sample <span className="font-mono">pick_frac*legal + pick_n</span> moves uniformly, then play the best policy among them.
                                </div>
                            </div>
                        )}

                        {settings.aiStrategy === 'local' && (
                            <div className="mt-3 grid grid-cols-3 gap-3">
                                <div className="space-y-1">
                                    <label className="text-gray-300 block text-sm">Override</label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={1}
                                        step={0.01}
                                        value={settings.aiLocalPickOverride}
                                        onChange={(e) => updateSettings({ aiLocalPickOverride: Math.max(0, Math.min(1, parseFloat(e.target.value || '0'))) })}
                                        className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-gray-300 block text-sm">Stddev</label>
                                    <input
                                        type="number"
                                        min={0.1}
                                        step={0.5}
                                        value={settings.aiLocalStddev}
                                        onChange={(e) => updateSettings({ aiLocalStddev: Math.max(0.1, parseFloat(e.target.value || '0')) })}
                                        className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-gray-300 block text-sm">Endgame</label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={1}
                                        step={0.05}
                                        value={settings.aiLocalEndgame}
                                        onChange={(e) => updateSettings({ aiLocalEndgame: Math.max(0, Math.min(1, parseFloat(e.target.value || '0'))) })}
                                        className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-gray-300 block text-sm">Pick N</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={settings.aiLocalPickN}
                                        onChange={(e) => updateSettings({ aiLocalPickN: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                                        className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-gray-300 block text-sm">Pick Frac</label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={1}
                                        step={0.05}
                                        value={settings.aiLocalPickFrac}
                                        onChange={(e) => updateSettings({ aiLocalPickFrac: Math.max(0, Math.min(1, parseFloat(e.target.value || '0'))) })}
                                        className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                    />
                                </div>
                                <div className="col-span-3 text-xs text-gray-500">
                                    KaTrain local: weights sampling by a Gaussian around the previous move (then picks the best policy among sampled moves).
                                </div>
                            </div>
                        )}

                        {settings.aiStrategy === 'tenuki' && (
                            <div className="mt-3 grid grid-cols-3 gap-3">
                                <div className="space-y-1">
                                    <label className="text-gray-300 block text-sm">Override</label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={1}
                                        step={0.01}
                                        value={settings.aiTenukiPickOverride}
                                        onChange={(e) => updateSettings({ aiTenukiPickOverride: Math.max(0, Math.min(1, parseFloat(e.target.value || '0'))) })}
                                        className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-gray-300 block text-sm">Stddev</label>
                                    <input
                                        type="number"
                                        min={0.1}
                                        step={0.5}
                                        value={settings.aiTenukiStddev}
                                        onChange={(e) => updateSettings({ aiTenukiStddev: Math.max(0.1, parseFloat(e.target.value || '0')) })}
                                        className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-gray-300 block text-sm">Endgame</label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={1}
                                        step={0.05}
                                        value={settings.aiTenukiEndgame}
                                        onChange={(e) => updateSettings({ aiTenukiEndgame: Math.max(0, Math.min(1, parseFloat(e.target.value || '0'))) })}
                                        className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-gray-300 block text-sm">Pick N</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={settings.aiTenukiPickN}
                                        onChange={(e) => updateSettings({ aiTenukiPickN: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                                        className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-gray-300 block text-sm">Pick Frac</label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={1}
                                        step={0.05}
                                        value={settings.aiTenukiPickFrac}
                                        onChange={(e) => updateSettings({ aiTenukiPickFrac: Math.max(0, Math.min(1, parseFloat(e.target.value || '0'))) })}
                                        className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                    />
                                </div>
                                <div className="col-span-3 text-xs text-gray-500">
                                    KaTrain tenuki: weights sampling by <span className="font-mono">1 - Gaussian</span> around the previous move (prefers far away).
                                </div>
                            </div>
                        )}

                        {(settings.aiStrategy === 'influence' || settings.aiStrategy === 'territory') && (
                            <div className="mt-3 grid grid-cols-3 gap-3">
                                <div className="space-y-1">
                                    <label className="text-gray-300 block text-sm">Override</label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={1}
                                        step={0.01}
                                        value={settings.aiStrategy === 'influence' ? settings.aiInfluencePickOverride : settings.aiTerritoryPickOverride}
                                        onChange={(e) => {
                                            const v = Math.max(0, Math.min(1, parseFloat(e.target.value || '0')));
                                            updateSettings(settings.aiStrategy === 'influence' ? { aiInfluencePickOverride: v } : { aiTerritoryPickOverride: v });
                                        }}
                                        className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-gray-300 block text-sm">Threshold</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step={0.5}
                                        value={settings.aiStrategy === 'influence' ? settings.aiInfluenceThreshold : settings.aiTerritoryThreshold}
                                        onChange={(e) => {
                                            const v = Math.max(0, parseFloat(e.target.value || '0'));
                                            updateSettings(settings.aiStrategy === 'influence' ? { aiInfluenceThreshold: v } : { aiTerritoryThreshold: v });
                                        }}
                                        className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-gray-300 block text-sm">Line Wt</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={settings.aiStrategy === 'influence' ? settings.aiInfluenceLineWeight : settings.aiTerritoryLineWeight}
                                        onChange={(e) => {
                                            const v = Math.max(0, parseInt(e.target.value || '0', 10));
                                            updateSettings(settings.aiStrategy === 'influence' ? { aiInfluenceLineWeight: v } : { aiTerritoryLineWeight: v });
                                        }}
                                        className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-gray-300 block text-sm">Pick N</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={settings.aiStrategy === 'influence' ? settings.aiInfluencePickN : settings.aiTerritoryPickN}
                                        onChange={(e) => {
                                            const v = Math.max(0, parseInt(e.target.value || '0', 10));
                                            updateSettings(settings.aiStrategy === 'influence' ? { aiInfluencePickN: v } : { aiTerritoryPickN: v });
                                        }}
                                        className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-gray-300 block text-sm">Pick Frac</label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={1}
                                        step={0.05}
                                        value={settings.aiStrategy === 'influence' ? settings.aiInfluencePickFrac : settings.aiTerritoryPickFrac}
                                        onChange={(e) => {
                                            const v = Math.max(0, Math.min(1, parseFloat(e.target.value || '0')));
                                            updateSettings(settings.aiStrategy === 'influence' ? { aiInfluencePickFrac: v } : { aiTerritoryPickFrac: v });
                                        }}
                                        className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-gray-300 block text-sm">Endgame</label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={1}
                                        step={0.05}
                                        value={settings.aiStrategy === 'influence' ? settings.aiInfluenceEndgame : settings.aiTerritoryEndgame}
                                        onChange={(e) => {
                                            const v = Math.max(0, Math.min(1, parseFloat(e.target.value || '0')));
                                            updateSettings(settings.aiStrategy === 'influence' ? { aiInfluenceEndgame: v } : { aiTerritoryEndgame: v });
                                        }}
                                        className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                    />
                                </div>
                                <div className="col-span-3 text-xs text-gray-500">
                                    KaTrain {settings.aiStrategy}: distance-from-edge weights with <span className="font-mono">threshold</span> and <span className="font-mono">line_weight</span>.
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
                            <p className="text-xs text-gray-500">
                                Engine: <span className="font-mono">{engineBackend ?? 'not loaded'}</span>
                                {engineModelName ? (
                                    <>
                                        {' '}
                                        · <span className="font-mono" title={engineModelName}>{engineModelName}</span>
                                    </>
                                ) : null}
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mt-4">
                            <div className="space-y-1">
                                <label className="text-gray-300 block text-sm">Visits</label>
                                <input
                                    type="number"
                                    min={16}
                                    max={ENGINE_MAX_VISITS}
                                    value={settings.katagoVisits}
                                    onChange={(e) => updateSettings({ katagoVisits: Math.max(16, parseInt(e.target.value || '0', 10)) })}
                                    className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-gray-300 block text-sm">Fast Visits</label>
                                <input
                                    type="number"
                                    min={16}
                                    max={ENGINE_MAX_VISITS}
                                    value={settings.katagoFastVisits}
                                    onChange={(e) => updateSettings({ katagoFastVisits: Math.max(16, parseInt(e.target.value || '0', 10)) })}
                                    className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                />
                                <p className="text-xs text-gray-500">KaTrain fast_visits: initial visits for Space-ponder.</p>
                            </div>
                            <div className="space-y-1">
                                <label className="text-gray-300 block text-sm">Max Time (ms)</label>
                                <input
                                    type="number"
                                    min={25}
                                    max={ENGINE_MAX_TIME_MS}
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

                        <div className="mt-3 grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-gray-300 block text-sm">Wide Root Noise</label>
                                <input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={settings.katagoWideRootNoise}
                                    onChange={(e) => updateSettings({ katagoWideRootNoise: Math.max(0, parseFloat(e.target.value || '0')) })}
                                    className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                />
                                <p className="text-xs text-gray-500">KaTrain default is 0.04; set 0 for strongest/most stable.</p>
                            </div>
                            <div className="space-y-1">
                                <label className="text-gray-300 block text-sm">PV Len</label>
                                <input
                                    type="number"
                                    min={0}
                                    max={60}
                                    step={1}
                                    value={settings.katagoAnalysisPvLen}
                                    onChange={(e) => updateSettings({ katagoAnalysisPvLen: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                                    className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm font-mono"
                                />
                                <p className="text-xs text-gray-500">KataGo analysisPVLen (moves after the first).</p>
                            </div>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-gray-300 block text-sm">Ownership</label>
                                <select
                                    value={settings.katagoOwnershipMode}
                                    onChange={(e) => updateSettings({ katagoOwnershipMode: e.target.value as 'root' | 'tree' })}
                                    className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 focus:border-green-500 outline-none text-sm"
                                >
                                    <option value="tree">Tree-averaged (KaTrain)</option>
                                    <option value="root">Root-only (faster)</option>
                                </select>
                                <p className="text-xs text-gray-500">
                                    KaTrain uses tree-averaged ownership; root-only disables per-move ownership for speed.
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

                        <div className="mt-3 space-y-1">
                            <label className="text-gray-300 block text-sm">Randomize Symmetry</label>
                            <label className="flex items-center space-x-2 text-sm text-gray-300">
                                <input
                                    type="checkbox"
                                    checked={settings.katagoNnRandomize}
                                    onChange={(e) => updateSettings({ katagoNnRandomize: e.target.checked })}
                                    className="rounded"
                                />
                                <span>Enable (nnRandomize)</span>
                            </label>
                            <p className="text-xs text-gray-500">
                                Matches KataGo defaults; disable for deterministic/stable analysis.
                            </p>
                        </div>

                        <div className="mt-3 space-y-1">
                            <label className="text-gray-300 block text-sm">Conservative Pass</label>
                            <label className="flex items-center space-x-2 text-sm text-gray-300">
                                <input
                                    type="checkbox"
                                    checked={settings.katagoConservativePass}
                                    onChange={(e) => updateSettings({ katagoConservativePass: e.target.checked })}
                                    className="rounded"
                                />
                                <span>Enable (conservativePass)</span>
                            </label>
                            <p className="text-xs text-gray-500">
                                KaTrain default: suppresses “pass ends game” features at the root.
                            </p>
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
