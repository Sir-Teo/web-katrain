import React from 'react';
import { shallow } from 'zustand/shallow';
import { useGameStore } from '../store/gameStore';
import { FaTimes } from 'react-icons/fa';
import type { GameSettings } from '../types';
import { ENGINE_MAX_TIME_MS, ENGINE_MAX_VISITS } from '../engine/katago/limits';
import { publicUrl } from '../utils/publicUrl';
import { BOARD_THEME_OPTIONS } from '../utils/boardThemes';
import { getEngineModelLabel } from '../utils/engineLabel';
import { UI_THEME_OPTIONS } from '../utils/uiThemes';
import { BOARD_SIZES, getMaxHandicap } from '../utils/boardSize';

let uploadedModelUrl: string | null = null;
let lastManualModelUrl: string | null = null;

const OFFICIAL_MODELS: Array<{
    label: string;
    name: string;
    url: string;
    badge?: string;
    uploaded: string;
    size: string;
    downloadAndLoad?: boolean;
}> = [
    {
        label: 'Latest (b28)',
        name: 'kata1-b28c512nbt-s12253653760-d5671874532',
        url: 'https://media.katagotraining.org/uploaded/networks/models/kata1/kata1-b28c512nbt-s12253653760-d5671874532.bin.gz',
        badge: 'Latest',
        uploaded: '2026-01-16',
        size: '~280 MB',
    },
    {
        label: 'Strongest (b28)',
        name: 'kata1-b28c512nbt-s12192929536-d5655876072',
        url: 'https://media.katagotraining.org/uploaded/networks/models/kata1/kata1-b28c512nbt-s12192929536-d5655876072.bin.gz',
        badge: 'Strongest',
        uploaded: '2026-01-06',
        size: '~280 MB',
    },
    {
        label: 'Strongest (b18)',
        name: 'kata1-b18c384nbt-s9996604416-d4316597426',
        url: publicUrl('models/kata1-b18c384nbt-s9996604416-d4316597426.bin.gz'),
        badge: 'Strongest b18',
        uploaded: '2024-05-26',
        size: '~96 MB',
        downloadAndLoad: true,
    },
    {
        label: 'Adam (b28)',
        name: 'kata1-b28c512nbt-adam-s11387M-d5458M',
        url: 'https://media.katagotraining.org/uploaded/networks/models/kata1/kata1-b28c512nbt-adam-s11387M-d5458M.bin.gz',
        badge: 'Adam',
        uploaded: '2025-10-12',
        size: '~280 MB',
    },
];

const revokeUploadedModelUrl = () => {
    if (!uploadedModelUrl) return;
    URL.revokeObjectURL(uploadedModelUrl);
    uploadedModelUrl = null;
};

interface SettingsModalProps {
    onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
    const { settings, updateSettings, engineBackend, engineModelName } = useGameStore(
        (state) => ({
            settings: state.settings,
            updateSettings: state.updateSettings,
            engineBackend: state.engineBackend,
            engineModelName: state.engineModelName,
        }),
        shallow
    );
    const engineModelLabel = getEngineModelLabel(engineModelName, settings.katagoModelUrl);
    const modelUploadInputRef = React.useRef<HTMLInputElement>(null);
    const [copiedUrl, setCopiedUrl] = React.useState<string | null>(null);
    const [downloadingUrl, setDownloadingUrl] = React.useState<string | null>(null);
    const [downloadError, setDownloadError] = React.useState<string | null>(null);

    const [activeTab, setActiveTab] = React.useState('general');  
  
    const tabs = [  
        { id: 'general', label: 'General' },  
        { id: 'analysis', label: 'Analysis' },  
        { id: 'ai', label: 'AI/Engine' },  
    ];

    const DEFAULT_EVAL_THRESHOLDS = [12, 6, 3, 1.5, 0.5, 0];
    const DEFAULT_SHOW_DOTS = [true, true, true, true, true, true];
    const DEFAULT_SAVE_FEEDBACK = [true, true, true, true, false, false];
    const DEFAULT_ANIM_PV_TIME = 0.5;
    const KATRAIN_DEFAULT_MODEL_URL = publicUrl('models/kata1-b18c384nbt-s9996604416-d4316597426.bin.gz');
    const SMALL_MODEL_URL = publicUrl('models/katago-small.bin.gz');
    const isUploadedModel = settings.katagoModelUrl.startsWith('blob:');
    const sectionClass =
        'rounded-2xl border ui-surface p-4 sm:p-5 shadow-[0_14px_40px_rgba(0,0,0,0.35)]';
    const sectionTitleClass = 'text-xs font-semibold ui-text-muted tracking-[0.12em] uppercase';
    const rowClass = 'flex items-center justify-between gap-4 min-h-11';
    const labelClass = 'text-[var(--ui-text)] text-sm sm:text-base';
    const inputClass =
        'w-full ui-input rounded-lg px-3 py-2 border focus:border-[var(--ui-accent)] outline-none text-sm font-mono';
    const selectClass =
        'w-full ui-input rounded-lg px-3 py-2 border focus:border-[var(--ui-accent)] outline-none text-sm';
    const subtextClass = 'text-xs ui-text-faint leading-relaxed';
    const pillButtonClass =
        'px-3 py-2 rounded-lg ui-surface-2 text-xs font-mono text-[var(--ui-text)] border transition-colors hover:brightness-110';

    const TOP_MOVE_OPTIONS: Array<{ value: GameSettings['trainerTopMovesShow']; label: string }> = [
        { value: 'top_move_delta_score', label: 'Δ Score (points lost)' },
        { value: 'top_move_visits', label: 'Visits' },
        { value: 'top_move_score', label: 'Score' },
        { value: 'top_move_winrate', label: 'Winrate' },
        { value: 'top_move_delta_winrate', label: 'Δ Winrate' },
        { value: 'top_move_nothing', label: 'Nothing' },
    ];
    const UI_DENSITY_OPTIONS: Array<{ value: GameSettings['uiDensity']; label: string; description: string }> = [
        { value: 'compact', label: 'Compact', description: 'Tighter bars and smaller controls.' },
        { value: 'comfortable', label: 'Comfortable', description: 'Balanced sizing for most screens.' },
        { value: 'large', label: 'Large', description: 'Roomier controls and text.' },
    ];
    const uiThemeMeta = UI_THEME_OPTIONS.find((theme) => theme.value === settings.uiTheme);
    const uiDensityMeta = UI_DENSITY_OPTIONS.find((density) => density.value === settings.uiDensity);
    const maxHandicap = getMaxHandicap(settings.defaultBoardSize);

    React.useEffect(() => {
        if (!isUploadedModel) {
            lastManualModelUrl = settings.katagoModelUrl;
        }
        if (!uploadedModelUrl) return;
        if (settings.katagoModelUrl !== uploadedModelUrl) {
            revokeUploadedModelUrl();
        }
    }, [isUploadedModel, settings.katagoModelUrl]);

    const handleModelUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!isUploadedModel) {
            lastManualModelUrl = settings.katagoModelUrl;
        }
        if (uploadedModelUrl) URL.revokeObjectURL(uploadedModelUrl);
        const objectUrl = URL.createObjectURL(file);
        uploadedModelUrl = objectUrl;
        updateSettings({ katagoModelUrl: objectUrl });
        event.target.value = '';
    };

    const handleCopyUrl = (url: string) => {
        const onCopied = () => {
            setCopiedUrl(url);
            window.setTimeout(() => {
                setCopiedUrl((current) => (current === url ? null : current));
            }, 2000);
        };

        if (navigator?.clipboard?.writeText) {
            navigator.clipboard.writeText(url).then(onCopied).catch(() => {});
            return;
        }

        try {
            const input = document.createElement('input');
            input.value = url;
            input.style.position = 'fixed';
            input.style.left = '-9999px';
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
            onCopied();
        } catch {
            // Ignore copy failure.
        }
    };

    const handleClearUpload = () => {
        if (!isUploadedModel) return;
        revokeUploadedModelUrl();
        updateSettings({ katagoModelUrl: lastManualModelUrl ?? KATRAIN_DEFAULT_MODEL_URL });
    };

    const handleDownloadAndLoad = async (url: string) => {
        if (downloadingUrl) return;
        setDownloadError(null);
        setDownloadingUrl(url);
        try {
            if (!isUploadedModel) {
                lastManualModelUrl = settings.katagoModelUrl;
            }
            revokeUploadedModelUrl();
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Download failed (${response.status})`);
            }
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            uploadedModelUrl = objectUrl;
            updateSettings({ katagoModelUrl: objectUrl });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Download failed.';
            const hint = message.toLowerCase().includes('failed to fetch')
                ? 'Download blocked by browser (CORS). Use "Download" then "Upload Weights".'
                : message;
            setDownloadError(hint);
        } finally {
            setDownloadingUrl(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-6 mobile-safe-inset mobile-safe-area-bottom">
            <div className="w-full max-w-[960px] h-[92dvh] sm:h-auto sm:max-h-[92dvh] ui-panel rounded-2xl shadow-2xl border overflow-hidden flex flex-col">
                <div className="sticky top-0 z-10 flex items-center justify-between px-4 sm:px-6 py-4 border-b ui-bar backdrop-blur">
                    <h2 className="text-lg sm:text-xl font-semibold text-[var(--ui-text)]">Settings</h2>
                    <button onClick={onClose} className="ui-text-muted hover:text-white transition-colors">
                        <FaTimes />
                    </button>
                </div>
                <div className="px-4 sm:px-6 py-5 flex flex-col flex-1 overflow-hidden">  
                    {/* Tab Navigation */}  
                    <div className="flex border-b border-slate-700 mb-5">  
                        {tabs.map(tab => (  
                            <button  
                                key={tab.id}  
                                onClick={() => setActiveTab(tab.id)}  
                                className={`px-4 py-2 text-sm font-medium transition-colors ${  
                                    activeTab === tab.id  
                                        ? 'text-white border-b-2 border-blue-500'  
                                        : 'text-slate-400 hover:text-white'  
                                }`}  
                            >  
                                {tab.label}  
                            </button>  
                        ))}  
                    </div>  
                
                    {/* Tab Content */}  
                    <div className="flex-1 overflow-y-auto space-y-6">  
                        {activeTab === 'general' && (  
                            <>  
                                {/* Timer Section */}  
                                <div className={sectionClass}>  
                                    <div className="flex items-center justify-between">  
                                        <h3 className={sectionTitleClass}>Timer</h3>  
                                    </div>  
                                    <div className="mt-4 space-y-4">
                                        <div className={rowClass}>
                                            <label className={labelClass}>Sound Effects</label>
                                            <input
                                                type="checkbox"
                                                checked={settings.soundEnabled}
                                                onChange={(e) => updateSettings({ soundEnabled: e.target.checked })}
                                                className="toggle"
                                            />
                                        </div>

                                        <div className={rowClass}>
                                            <label className={labelClass}>Timer Sound</label>
                                            <input
                                                type="checkbox"
                                                checked={settings.timerSound}
                                                onChange={(e) => updateSettings({ timerSound: e.target.checked })}
                                                className="toggle"
                                            />
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Main Time (min)</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={1}
                                                    value={settings.timerMainTimeMinutes}
                                                    onChange={(e) => updateSettings({ timerMainTimeMinutes: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                                                    className={inputClass}
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Byo Length (sec)</label>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    step={1}
                                                    value={settings.timerByoLengthSeconds}
                                                    onChange={(e) => updateSettings({ timerByoLengthSeconds: Math.max(1, parseInt(e.target.value || '1', 10)) })}
                                                    className={inputClass}
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Byo Periods</label>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    step={1}
                                                    value={settings.timerByoPeriods}
                                                    onChange={(e) => updateSettings({ timerByoPeriods: Math.max(1, parseInt(e.target.value || '1', 10)) })}
                                                    className={inputClass}
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Minimal Use (sec)</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={1}
                                                    value={settings.timerMinimalUseSeconds}
                                                    onChange={(e) => updateSettings({ timerMinimalUseSeconds: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                                                    className={inputClass}
                                                />
                                            </div>
                                        </div>

                                        <p className={subtextClass}>
                                            KaTrain-style clock (main time, then byo-yomi periods). Timer runs only in Play mode and only for human turns.
                                        </p>
                                    </div>
                                </div>  
                
                                {/* Board Theme Section */}  
                                <div className={sectionClass}>  
                                    <h3 className={sectionTitleClass}>Board Theme</h3>  
                                    <div className="mt-4 space-y-4">
                                        <div className={rowClass}>
                                            <label className={labelClass}>Show Coordinates</label>
                                            <input
                                                type="checkbox"
                                                checked={settings.showCoordinates}
                                                onChange={(e) => updateSettings({ showCoordinates: e.target.checked })}
                                                className="toggle"
                                            />
                                        </div>

                                        <div className={rowClass}>
                                            <label className={labelClass}>Next Move Preview</label>
                                            <input
                                                type="checkbox"
                                                checked={settings.showNextMovePreview}
                                                onChange={(e) => updateSettings({ showNextMovePreview: e.target.checked })}
                                                className="toggle"
                                            />
                                        </div>

                                        <div className={rowClass}>
                                            <label className={labelClass}>Show Move Numbers</label>
                                            <input
                                                type="checkbox"
                                                checked={settings.showMoveNumbers}
                                                onChange={(e) => updateSettings({ showMoveNumbers: e.target.checked })}
                                                className="toggle"
                                            />
                                        </div>

                                        <div className={rowClass}>
                                            <label className={labelClass}>Show Board Controls</label>
                                            <input
                                                type="checkbox"
                                                checked={settings.showBoardControls}
                                                onChange={(e) => updateSettings({ showBoardControls: e.target.checked })}
                                                className="toggle"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="ui-text-muted block">Board Theme</label>
                                            <select
                                                value={settings.boardTheme}
                                                onChange={(e) => updateSettings({ boardTheme: e.target.value as GameSettings['boardTheme'] })}
                                                className={selectClass}
                                            >
                                                {BOARD_THEME_OPTIONS.map((theme) => (
                                                    <option key={theme.value} value={theme.value}>
                                                        {theme.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div className="space-y-2">
                                                <label className="ui-text-muted block">Default Board Size</label>
                                                <select
                                                    value={settings.defaultBoardSize}
                                                    onChange={(e) => {
                                                        const nextSize = Number(e.target.value) as GameSettings['defaultBoardSize'];
                                                        const nextMax = getMaxHandicap(nextSize);
                                                        updateSettings({
                                                            defaultBoardSize: nextSize,
                                                            defaultHandicap: Math.min(settings.defaultHandicap, nextMax),
                                                        });
                                                    }}
                                                    className={selectClass}
                                                >
                                                    {BOARD_SIZES.map((size) => (
                                                        <option key={size} value={size}>{size}×{size}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="ui-text-muted block">Default Handicap</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={maxHandicap}
                                                    step={1}
                                                    value={settings.defaultHandicap}
                                                    onChange={(e) => {
                                                        const next = Number.parseInt(e.target.value || '0', 10);
                                                        updateSettings({
                                                            defaultHandicap: Math.max(0, Math.min(Number.isFinite(next) ? next : 0, maxHandicap)),
                                                        });
                                                    }}
                                                    className={inputClass}
                                                />
                                            </div>
                                        </div>
                                        <p className={subtextClass}>Defaults for the New Game dialog.</p>

                                        <div className="space-y-2">
                                            <label className="ui-text-muted block">UI Theme</label>
                                            <select
                                                value={settings.uiTheme}
                                                onChange={(e) => updateSettings({ uiTheme: e.target.value as GameSettings['uiTheme'] })}
                                                className={selectClass}
                                            >
                                                {UI_THEME_OPTIONS.map((theme) => (
                                                    <option key={theme.value} value={theme.value}>
                                                        {theme.label}
                                                    </option>
                                                ))}
                                            </select>
                                            {uiThemeMeta ? <p className={subtextClass}>{uiThemeMeta.description}</p> : null}
                                        </div>

                                        <div className="space-y-2">
                                            <label className="ui-text-muted block">UI Density</label>
                                            <select
                                                value={settings.uiDensity}
                                                onChange={(e) => updateSettings({ uiDensity: e.target.value as GameSettings['uiDensity'] })}
                                                className={selectClass}
                                            >
                                                {UI_DENSITY_OPTIONS.map((density) => (
                                                    <option key={density.value} value={density.value}>
                                                        {density.label}
                                                    </option>
                                                ))}
                                            </select>
                                            {uiDensityMeta ? <p className={subtextClass}>{uiDensityMeta.description}</p> : null}
                                        </div>
                                    </div>  
                                </div>

                                {/* Rules Section */}  
                                <div className={sectionClass}>  
                                    <h3 className={sectionTitleClass}>Rules</h3>  
                                    <div className="mt-4 space-y-4">
                                        <div className={rowClass}>
                                            <label className={labelClass}>Load SGF Rewind</label>
                                            <input
                                                type="checkbox"
                                                checked={settings.loadSgfRewind}
                                                onChange={(e) => updateSettings({ loadSgfRewind: e.target.checked })}
                                                className="toggle"
                                            />
                                        </div>

                                        <div className={rowClass}>
                                            <label className={labelClass}>Load SGF Fast Analysis</label>
                                            <input
                                                type="checkbox"
                                                checked={settings.loadSgfFastAnalysis}
                                                onChange={(e) => updateSettings({ loadSgfFastAnalysis: e.target.checked })}
                                                className="toggle"
                                            />
                                        </div>
                                        <p className={subtextClass}>
                                            KaTrain-style: runs fast MCTS analysis on load (uses “Fast Visits”) so graphs/points lost fill in quickly.
                                        </p>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">PV Animation Time (sec)</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={0.05}
                                                    value={settings.animPvTimeSeconds ?? DEFAULT_ANIM_PV_TIME}
                                                    onChange={(e) =>
                                                        updateSettings({
                                                            animPvTimeSeconds: Math.max(0, parseFloat(e.target.value || String(DEFAULT_ANIM_PV_TIME))),
                                                        })
                                                    }
                                                    className={inputClass}
                                                />
                                                <p className={subtextClass}>KaTrain-style PV animation speed (0 disables animation).</p>
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Rules</label>
                                                <select
                                                    value={settings.gameRules}
                                                    onChange={(e) => updateSettings({ gameRules: e.target.value as GameSettings['gameRules'] })}
                                                    className={selectClass}
                                                >
                                                    <option value="japanese">Japanese (KaTrain default)</option>
                                                    <option value="chinese">Chinese</option>
                                                    <option value="korean">Korean</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>  
                                </div>
                            </>  
                        )}  
                
                        {activeTab === 'analysis' && (  
                            <>  
                                {/* Analysis Overlays Section */}  
                                <div className={sectionClass}>  
                                    <h3 className={sectionTitleClass}>Analysis Overlays</h3>

                                    <div className="mt-4 space-y-4">
                                        <div className={rowClass}>
                                            <label className={labelClass}>Show Children (Q)</label>
                                            <input
                                                type="checkbox"
                                                checked={settings.analysisShowChildren}
                                                onChange={(e) => updateSettings({ analysisShowChildren: e.target.checked })}
                                                className="toggle"
                                            />
                                        </div>

                                        <div className={rowClass}>
                                            <label className={labelClass}>Evaluation Dots (W)</label>
                                            <input
                                                type="checkbox"
                                                checked={settings.analysisShowEval}
                                                onChange={(e) => updateSettings({ analysisShowEval: e.target.checked })}
                                                className="toggle"
                                            />
                                        </div>

                                        <div className={rowClass}>
                                            <label className={labelClass}>Top Moves (Hints) (E)</label>
                                            <input
                                                type="checkbox"
                                                checked={settings.analysisShowHints}
                                                onChange={(e) => updateSettings({ analysisShowHints: e.target.checked })}
                                                className="toggle"
                                            />
                                        </div>

                                        <div className={rowClass}>
                                            <label className={labelClass}>Policy (R)</label>
                                            <input
                                                type="checkbox"
                                                checked={settings.analysisShowPolicy}
                                                onChange={(e) => updateSettings({ analysisShowPolicy: e.target.checked })}
                                                className="toggle"
                                            />
                                        </div>

                                        <div className={rowClass}>
                                            <label className={labelClass}>Ownership (Territory) (T)</label>
                                            <input
                                                type="checkbox"
                                                checked={settings.analysisShowOwnership}
                                                onChange={(e) => updateSettings({ analysisShowOwnership: e.target.checked })}
                                                className="toggle"
                                            />
                                        </div>

                                        <div className="pt-2 border-t border-slate-700/50 space-y-4">
                                            <h4 className={sectionTitleClass}>KaTrain Hint Labels</h4>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <label className="text-slate-300 block text-sm">Evaluation Theme</label>
                                                    <select
                                                        value={settings.trainerTheme ?? 'theme:normal'}
                                                        onChange={(e) => updateSettings({ trainerTheme: e.target.value as GameSettings['trainerTheme'] })}
                                                        className={selectClass}
                                                    >
                                                        <option value="theme:normal">Normal</option>
                                                        <option value="theme:red-green-colourblind">Red/Green colourblind</option>
                                                    </select>
                                                </div>

                                                <div className="space-y-1">
                                                    <label className="text-slate-300 block text-sm">Low Visits Threshold</label>
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        step={1}
                                                        value={settings.trainerLowVisits}
                                                        onChange={(e) => updateSettings({ trainerLowVisits: Math.max(1, parseInt(e.target.value || '1', 10)) })}
                                                        className={inputClass}
                                                    />
                                                </div>

                                                <div className="space-y-1">
                                                    <label className="text-slate-300 block text-sm">Primary Label</label>
                                                    <select
                                                        value={settings.trainerTopMovesShow}
                                                        onChange={(e) => updateSettings({ trainerTopMovesShow: e.target.value as GameSettings['trainerTopMovesShow'] })}
                                                        className={selectClass}
                                                    >
                                                        {TOP_MOVE_OPTIONS.map((o) => (
                                                            <option key={o.value} value={o.value}>
                                                                {o.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div className="space-y-1">
                                                    <label className="text-slate-300 block text-sm">Secondary Label</label>
                                                    <select
                                                        value={settings.trainerTopMovesShowSecondary}
                                                        onChange={(e) =>
                                                            updateSettings({ trainerTopMovesShowSecondary: e.target.value as GameSettings['trainerTopMovesShowSecondary'] })
                                                        }
                                                        className={selectClass}
                                                    >
                                                        {TOP_MOVE_OPTIONS.map((o) => (
                                                            <option key={o.value} value={o.value}>
                                                                {o.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div className={rowClass}>
                                                    <label className={labelClass}>Extra Precision</label>
                                                    <input
                                                        type="checkbox"
                                                        checked={settings.trainerExtraPrecision}
                                                        onChange={(e) => updateSettings({ trainerExtraPrecision: e.target.checked })}
                                                        className="toggle"
                                                    />
                                                </div>

                                                <div className={rowClass}>
                                                    <label className={labelClass}>Show AI Dots</label>
                                                    <input
                                                        type="checkbox"
                                                        checked={settings.trainerEvalShowAi}
                                                        onChange={(e) => updateSettings({ trainerEvalShowAi: e.target.checked })}
                                                        className="toggle"
                                                    />
                                                </div>

                                                <div className={rowClass}>
                                                    <label className={labelClass}>Cache analysis to SGF</label>
                                                    <input
                                                        type="checkbox"
                                                        checked={settings.trainerSaveAnalysis}
                                                        onChange={(e) => updateSettings({ trainerSaveAnalysis: e.target.checked })}
                                                        className="toggle"
                                                    />
                                                </div>

                                                <div className={rowClass}>
                                                    <label className={labelClass}>Save SGF marks (X / square)</label>
                                                    <input
                                                        type="checkbox"
                                                        checked={settings.trainerSaveMarks}
                                                        onChange={(e) => updateSettings({ trainerSaveMarks: e.target.checked })}
                                                        className="toggle"
                                                    />
                                                </div>
                                            </div>

                                            <div className={rowClass}>
                                                <label className={labelClass}>Lock AI details (Play mode)</label>
                                                <input
                                                    type="checkbox"
                                                    checked={settings.trainerLockAi}
                                                    onChange={(e) => updateSettings({ trainerLockAi: e.target.checked })}
                                                    className="toggle"
                                                />
                                            </div>
                                        </div>
                                    </div>  
                                </div>
                
                                {/* Show Last N Eval Dots Section */}  
                                <div className={sectionClass}>  
                                    <h3 className={sectionTitleClass}>Show Last N Eval Dots</h3>
                                    <div className="mt-4 space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-slate-300 block">Show Last N Eval Dots</label>
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="10"
                                                    value={settings.showLastNMistakes}
                                                    onChange={(e) => updateSettings({ showLastNMistakes: parseInt(e.target.value, 10) })}
                                                    className="flex-1"
                                                />
                                                <span className="text-white font-mono w-8 text-right">{settings.showLastNMistakes}</span>
                                            </div>
                                            <p className={subtextClass}>
                                                Shows KaTrain-style colored dots on the last {settings.showLastNMistakes} moves.
                                            </p>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-slate-300 block">Mistake Threshold (Points)</label>
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                                <input
                                                    type="range"
                                                    min="0.5"
                                                    max="10"
                                                    step="0.5"
                                                    value={settings.mistakeThreshold ?? 3.0}
                                                    onChange={(e) => updateSettings({ mistakeThreshold: parseFloat(e.target.value) })}
                                                    className="flex-1"
                                                />
                                                <span className="text-white font-mono w-10 text-right">{(settings.mistakeThreshold ?? 3.0).toFixed(1)}</span>
                                            </div>
                                            <p className={subtextClass}>
                                                Minimum points lost to consider a move a mistake for navigation.
                                            </p>
                                        </div>
                                    </div>  
                                </div>
                
                                {/* Teach Mode Section */}  
                                <div className={sectionClass}>  
                                    <h3 className={sectionTitleClass}>Teach Mode</h3>
                                    <p className={`${subtextClass} mt-2`}>
                                        KaTrain-style auto-undo after analysis based on points lost. Values &lt; 1 are treated as a probability; values ≥ 1 are
                                        treated as a max variation count.
                                    </p>

                                    <div className="mt-4 space-y-3">
                                        {DEFAULT_EVAL_THRESHOLDS.map((fallbackThr, i) => {
                                            const thr = settings.trainerEvalThresholds?.[i] ?? fallbackThr;
                                            const undo = settings.teachNumUndoPrompts?.[i] ?? 0;
                                            const showDot = settings.trainerShowDots?.[i] ?? true;
                                            const saveFeedback = settings.trainerSaveFeedback?.[i] ?? false;

                                            return (
                                                <div key={`teach-${i}`} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 items-start">
                                                    <div className="space-y-1">
                                                        <label className="text-slate-300 block text-xs">≥ Threshold</label>
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
                                                            className={inputClass}
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-slate-300 block text-xs">Undo</label>
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
                                                            className={inputClass}
                                                        />
                                                    </div>
                                                    <div className="flex items-center justify-between gap-3">
                                                        <label className="text-slate-300 text-xs">Show dots</label>
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
                                                    <div className="flex items-center justify-between gap-3">
                                                        <label className="text-slate-300 text-xs">Save SGF</label>
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

                                        <p className={subtextClass}>
                                            Matches KaTrain’s teacher config: thresholds define dot color classes; “Save SGF” controls auto-feedback comments.
                                        </p>
                                    </div>  
                                </div>
                            </>  
                        )}  
                
                        {activeTab === 'ai' && (  
                            <>  
                                {/* AI Section */}  
                                <div className={sectionClass}>  
                                    <h3 className={sectionTitleClass}>AI</h3>

                                    <div className="mt-4 space-y-2">
                                        <label className="text-slate-300 block">Strategy</label>
                                        <select
                                            value={settings.aiStrategy}
                                            onChange={(e) => updateSettings({ aiStrategy: e.target.value as GameSettings['aiStrategy'] })}
                                            className={selectClass}
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
                                            <label className="text-slate-300 block text-sm">Kyu Rank</label>
                                            <input
                                                type="number"
                                                step={0.5}
                                                value={settings.aiRankKyu}
                                                onChange={(e) => updateSettings({ aiRankKyu: parseFloat(e.target.value || '0') })}
                                                className={inputClass}
                                            />
                                            <p className={subtextClass}>
                                                KaTrain’s calibrated rank-based policy picking (e.g. 4 = 4k, 0 = 1d, -3 = 4d).
                                            </p>
                                        </div>
                                    )}

                                    {settings.aiStrategy === 'scoreloss' && (
                                        <div className="mt-3 space-y-1">
                                            <label className="text-slate-300 block text-sm">Strength (c)</label>
                                            <input
                                                type="number"
                                                min={0}
                                                step={0.05}
                                                value={settings.aiScoreLossStrength}
                                                onChange={(e) => updateSettings({ aiScoreLossStrength: Math.max(0, parseFloat(e.target.value || '0')) })}
                                                className={inputClass}
                                            />
                                            <p className={subtextClass}>
                                                Higher = plays closer to best move; lower = more random among worse moves.
                                            </p>
                                        </div>
                                    )}

                                    {settings.aiStrategy === 'jigo' && (
                                        <div className="mt-3 space-y-1">
                                            <label className="text-slate-300 block text-sm">Target Score</label>
                                            <input
                                                type="number"
                                                step={0.1}
                                                value={settings.aiJigoTargetScore}
                                                onChange={(e) => updateSettings({ aiJigoTargetScore: parseFloat(e.target.value || '0') })}
                                                className={inputClass}
                                            />
                                            <p className={subtextClass}>
                                                Chooses the move whose <span className="font-mono">scoreLead</span> is closest to this (for the side to play).
                                            </p>
                                        </div>
                                    )}

                                    {(settings.aiStrategy === 'simple' || settings.aiStrategy === 'settle') && (
                                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Max Pt Lost</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={0.25}
                                                    value={settings.aiOwnershipMaxPointsLost}
                                                    onChange={(e) => updateSettings({ aiOwnershipMaxPointsLost: Math.max(0, parseFloat(e.target.value || '0')) })}
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Settled Wt</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={0.25}
                                                    value={settings.aiOwnershipSettledWeight}
                                                    onChange={(e) => updateSettings({ aiOwnershipSettledWeight: Math.max(0, parseFloat(e.target.value || '0')) })}
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Opp Fac</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={0.1}
                                                    value={settings.aiOwnershipOpponentFac}
                                                    onChange={(e) => updateSettings({ aiOwnershipOpponentFac: Math.max(0, parseFloat(e.target.value || '0')) })}
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Min Visits</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={1}
                                                    value={settings.aiOwnershipMinVisits}
                                                    onChange={(e) => updateSettings({ aiOwnershipMinVisits: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Attach Pen</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={0.25}
                                                    value={settings.aiOwnershipAttachPenalty}
                                                    onChange={(e) => updateSettings({ aiOwnershipAttachPenalty: Math.max(0, parseFloat(e.target.value || '0')) })}
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Tenuki Pen</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={0.25}
                                                    value={settings.aiOwnershipTenukiPenalty}
                                                    onChange={(e) => updateSettings({ aiOwnershipTenukiPenalty: Math.max(0, parseFloat(e.target.value || '0')) })}
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div className={`col-span-1 sm:col-span-2 lg:col-span-3 ${subtextClass}`}>
                                                KaTrain {settings.aiStrategy}: uses per-move ownership (slower) to favor “settled” outcomes.
                                            </div>
                                        </div>
                                    )}

                                    {settings.aiStrategy === 'policy' && (
                                        <div className="mt-3 space-y-1">
                                            <label className="text-slate-300 block text-sm">Opening Moves</label>
                                            <input
                                                type="number"
                                                min={0}
                                                step={1}
                                                value={settings.aiPolicyOpeningMoves}
                                                onChange={(e) => updateSettings({ aiPolicyOpeningMoves: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                                                className={inputClass}
                                            />
                                            <p className={subtextClass}>
                                                For the first N moves, uses weighted policy sampling (KaTrain-like).
                                            </p>
                                        </div>
                                    )}

                                    {settings.aiStrategy === 'weighted' && (
                                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Override</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={1}
                                                    step={0.01}
                                                    value={settings.aiWeightedPickOverride}
                                                    onChange={(e) => updateSettings({ aiWeightedPickOverride: Math.max(0, Math.min(1, parseFloat(e.target.value || '0'))) })}
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Weaken</label>
                                                <input
                                                    type="number"
                                                    min={0.01}
                                                    step={0.05}
                                                    value={settings.aiWeightedWeakenFac}
                                                    onChange={(e) => updateSettings({ aiWeightedWeakenFac: Math.max(0.01, parseFloat(e.target.value || '0')) })}
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Lower</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={0.001}
                                                    value={settings.aiWeightedLowerBound}
                                                    onChange={(e) => updateSettings({ aiWeightedLowerBound: Math.max(0, parseFloat(e.target.value || '0')) })}
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div className={`col-span-1 sm:col-span-2 lg:col-span-3 ${subtextClass}`}>
                                                Samples moves with probability proportional to <span className="font-mono">policy^(1/weaken)</span> above <span className="font-mono">lower</span>, unless the top policy move exceeds <span className="font-mono">override</span>.
                                            </div>
                                        </div>
                                    )}

                                    {settings.aiStrategy === 'pick' && (
                                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Override</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={1}
                                                    step={0.01}
                                                    value={settings.aiPickPickOverride}
                                                    onChange={(e) => updateSettings({ aiPickPickOverride: Math.max(0, Math.min(1, parseFloat(e.target.value || '0'))) })}
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Pick N</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={1}
                                                    value={settings.aiPickPickN}
                                                    onChange={(e) => updateSettings({ aiPickPickN: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Pick Frac</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={1}
                                                    step={0.05}
                                                    value={settings.aiPickPickFrac}
                                                    onChange={(e) => updateSettings({ aiPickPickFrac: Math.max(0, Math.min(1, parseFloat(e.target.value || '0'))) })}
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div className={`col-span-1 sm:col-span-2 lg:col-span-3 ${subtextClass}`}>
                                                KaTrain pick-based policy: sample <span className="font-mono">pick_frac*legal + pick_n</span> moves uniformly, then play the best policy among them.
                                            </div>
                                        </div>
                                    )}

                                    {settings.aiStrategy === 'local' && (
                                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Override</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={1}
                                                    step={0.01}
                                                    value={settings.aiLocalPickOverride}
                                                    onChange={(e) => updateSettings({ aiLocalPickOverride: Math.max(0, Math.min(1, parseFloat(e.target.value || '0'))) })}
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Stddev</label>
                                                <input
                                                    type="number"
                                                    min={0.1}
                                                    step={0.5}
                                                    value={settings.aiLocalStddev}
                                                    onChange={(e) => updateSettings({ aiLocalStddev: Math.max(0.1, parseFloat(e.target.value || '0')) })}
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Endgame</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={1}
                                                    step={0.05}
                                                    value={settings.aiLocalEndgame}
                                                    onChange={(e) => updateSettings({ aiLocalEndgame: Math.max(0, Math.min(1, parseFloat(e.target.value || '0'))) })}
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Pick N</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={1}
                                                    value={settings.aiLocalPickN}
                                                    onChange={(e) => updateSettings({ aiLocalPickN: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Pick Frac</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={1}
                                                    step={0.05}
                                                    value={settings.aiLocalPickFrac}
                                                    onChange={(e) => updateSettings({ aiLocalPickFrac: Math.max(0, Math.min(1, parseFloat(e.target.value || '0'))) })}
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div className={`col-span-1 sm:col-span-2 lg:col-span-3 ${subtextClass}`}>
                                                KaTrain local: weights sampling by a Gaussian around the previous move (then picks the best policy among sampled moves).
                                            </div>
                                        </div>
                                    )}

                                    {settings.aiStrategy === 'tenuki' && (
                                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Override</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={1}
                                                    step={0.01}
                                                    value={settings.aiTenukiPickOverride}
                                                    onChange={(e) => updateSettings({ aiTenukiPickOverride: Math.max(0, Math.min(1, parseFloat(e.target.value || '0'))) })}
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Stddev</label>
                                                <input
                                                    type="number"
                                                    min={0.1}
                                                    step={0.5}
                                                    value={settings.aiTenukiStddev}
                                                    onChange={(e) => updateSettings({ aiTenukiStddev: Math.max(0.1, parseFloat(e.target.value || '0')) })}
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Endgame</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={1}
                                                    step={0.05}
                                                    value={settings.aiTenukiEndgame}
                                                    onChange={(e) => updateSettings({ aiTenukiEndgame: Math.max(0, Math.min(1, parseFloat(e.target.value || '0'))) })}
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Pick N</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={1}
                                                    value={settings.aiTenukiPickN}
                                                    onChange={(e) => updateSettings({ aiTenukiPickN: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Pick Frac</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={1}
                                                    step={0.05}
                                                    value={settings.aiTenukiPickFrac}
                                                    onChange={(e) => updateSettings({ aiTenukiPickFrac: Math.max(0, Math.min(1, parseFloat(e.target.value || '0'))) })}
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div className={`col-span-1 sm:col-span-2 lg:col-span-3 ${subtextClass}`}>
                                                KaTrain tenuki: weights sampling by <span className="font-mono">1 - Gaussian</span> around the previous move (prefers far away).
                                            </div>
                                        </div>
                                    )}

                                    {(settings.aiStrategy === 'influence' || settings.aiStrategy === 'territory') && (
                                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Override</label>
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
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Threshold</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={0.5}
                                                    value={settings.aiStrategy === 'influence' ? settings.aiInfluenceThreshold : settings.aiTerritoryThreshold}
                                                    onChange={(e) => {
                                                        const v = Math.max(0, parseFloat(e.target.value || '0'));
                                                        updateSettings(settings.aiStrategy === 'influence' ? { aiInfluenceThreshold: v } : { aiTerritoryThreshold: v });
                                                    }}
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Line Wt</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={1}
                                                    value={settings.aiStrategy === 'influence' ? settings.aiInfluenceLineWeight : settings.aiTerritoryLineWeight}
                                                    onChange={(e) => {
                                                        const v = Math.max(0, parseInt(e.target.value || '0', 10));
                                                        updateSettings(settings.aiStrategy === 'influence' ? { aiInfluenceLineWeight: v } : { aiTerritoryLineWeight: v });
                                                    }}
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Pick N</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={1}
                                                    value={settings.aiStrategy === 'influence' ? settings.aiInfluencePickN : settings.aiTerritoryPickN}
                                                    onChange={(e) => {
                                                        const v = Math.max(0, parseInt(e.target.value || '0', 10));
                                                        updateSettings(settings.aiStrategy === 'influence' ? { aiInfluencePickN: v } : { aiTerritoryPickN: v });
                                                    }}
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Pick Frac</label>
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
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-slate-300 block text-sm">Endgame</label>
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
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div className={`col-span-1 sm:col-span-2 lg:col-span-3 ${subtextClass}`}>
                                                KaTrain {settings.aiStrategy}: distance-from-edge weights with <span className="font-mono">threshold</span> and <span className="font-mono">line_weight</span>.
                                            </div>
                                        </div>
                                    )}
                                </div>
                                {/* KataGo Section */}  
                                <div className={sectionClass}>  
                                    <h3 className={sectionTitleClass}>KataGo</h3>

                                    <div className="mt-4 space-y-2">
                                        <label className="text-slate-300 block">Model URL</label>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                className={pillButtonClass}
                                                onClick={() => updateSettings({ katagoModelUrl: KATRAIN_DEFAULT_MODEL_URL })}
                                                title="KaTrain default weights"
                                            >
                                                KaTrain Default
                                            </button>
                                            <button
                                                type="button"
                                                className={pillButtonClass}
                                                onClick={() => updateSettings({ katagoModelUrl: SMALL_MODEL_URL })}
                                                title="Small KataGo test model"
                                            >
                                                Small Model
                                            </button>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs text-slate-400 block">Upload weights (.bin.gz)</label>
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    className={pillButtonClass}
                                                    onClick={() => modelUploadInputRef.current?.click()}
                                                >
                                                    Upload Weights
                                                </button>
                                                {isUploadedModel ? (
                                                    <button
                                                        type="button"
                                                        className={pillButtonClass}
                                                        onClick={handleClearUpload}
                                                    >
                                                        Clear Upload
                                                    </button>
                                                ) : null}
                                            </div>
                                            <input
                                                ref={modelUploadInputRef}
                                                type="file"
                                                accept=".bin,.bin.gz,.gz,application/gzip,application/octet-stream"
                                                onChange={handleModelUpload}
                                                className="hidden"
                                            />
                                            {isUploadedModel ? (
                                                <p className={subtextClass}>
                                                    Uploaded weights stay in memory for this session only.
                                                </p>
                                            ) : null}
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs text-slate-400 block">Official KataGo models (download links)</label>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                {OFFICIAL_MODELS.map((model) => (
                                                    <div
                                                        key={model.url}
                                                        className="w-full text-left rounded-lg border px-3 py-2 bg-slate-900/60 border-slate-700/50 text-slate-200"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-semibold">{model.label}</span>
                                                            {model.badge ? (
                                                                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-800/70 text-slate-300 border border-slate-700/50">
                                                                    {model.badge}
                                                                </span>
                                                            ) : null}
                                                            <span className="ml-auto text-[10px] text-slate-400">{model.size}</span>
                                                        </div>
                                                        <div className="text-[11px] text-slate-400 font-mono truncate">
                                                            {model.name}
                                                        </div>
                                                        <div className="text-[10px] text-slate-500">
                                                            Uploaded {model.uploaded}
                                                        </div>
                                                        <div className="mt-2 flex items-center gap-2">
                                                            <a
                                                                href={model.url}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="px-2 py-1 text-xs rounded bg-slate-800/70 border border-slate-700/50 hover:bg-slate-700/70"
                                                                title={`Download ${model.name}`}
                                                            >
                                                                Download
                                                            </a>
                                                            {model.downloadAndLoad ? (
                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        type="button"
                                                                        className="px-2 py-1 text-xs rounded ui-accent-soft border hover:brightness-110 disabled:opacity-60"
                                                                        onClick={() => handleDownloadAndLoad(model.url)}
                                                                        disabled={downloadingUrl === model.url}
                                                                    >
                                                                        {downloadingUrl === model.url ? 'Downloading...' : 'Download & Load'}
                                                                    </button>
                                                                    <span className="text-[10px] text-[var(--ui-accent)]">Session memory</span>
                                                                </div>
                                                            ) : null}
                                                            <button
                                                                type="button"
                                                                className="px-2 py-1 text-xs rounded bg-slate-800/70 border border-slate-700/50 hover:bg-slate-700/70"
                                                                onClick={() => handleCopyUrl(model.url)}
                                                            >
                                                                {copiedUrl === model.url ? 'Copied' : 'Copy URL'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            {downloadError ? (
                                                <p className="text-xs text-rose-400">{downloadError}</p>
                                            ) : null}
                                            <p className={subtextClass}>
                                                Download then use "Upload Weights" above to load the model.
                                            </p>
                                        </div>
                                        <input
                                            type="text"
                                            value={settings.katagoModelUrl}
                                            onChange={(e) => updateSettings({ katagoModelUrl: e.target.value })}
                                            className={`${inputClass} text-xs`}
                                            placeholder={KATRAIN_DEFAULT_MODEL_URL}
                                        />
                                        <p className={subtextClass}>
                                            Use a local path under <span className="font-mono">{publicUrl('models/')}</span> or a full URL (must allow CORS).
                                        </p>
                                        <p className={subtextClass}>
                                            Engine: <span className="font-mono">{engineBackend ?? 'not loaded'}</span>
                                            {engineModelLabel ? (
                                                <>
                                                    {' '}
                                                    · <span className="font-mono" title={engineModelLabel}>{engineModelLabel}</span>
                                                </>
                                            ) : null}
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                                        <div className="space-y-1">
                                            <label className="text-slate-300 block text-sm">Visits</label>
                                            <input
                                                type="number"
                                                min={16}
                                                max={ENGINE_MAX_VISITS}
                                                value={settings.katagoVisits}
                                                onChange={(e) => updateSettings({ katagoVisits: Math.max(16, parseInt(e.target.value || '0', 10)) })}
                                                className={inputClass}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-slate-300 block text-sm">Fast Visits</label>
                                            <input
                                                type="number"
                                                min={16}
                                                max={ENGINE_MAX_VISITS}
                                                value={settings.katagoFastVisits}
                                                onChange={(e) => updateSettings({ katagoFastVisits: Math.max(16, parseInt(e.target.value || '0', 10)) })}
                                                className={inputClass}
                                            />
                                            <p className={subtextClass}>KaTrain fast_visits: initial visits for Space-ponder.</p>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-slate-300 block text-sm">Max Time (ms)</label>
                                            <input
                                                type="number"
                                                min={25}
                                                max={ENGINE_MAX_TIME_MS}
                                                value={settings.katagoMaxTimeMs}
                                                onChange={(e) => updateSettings({ katagoMaxTimeMs: Math.max(25, parseInt(e.target.value || '0', 10)) })}
                                                className={inputClass}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-slate-300 block text-sm">Batch Size</label>
                                            <input
                                                type="number"
                                                min={1}
                                                max={64}
                                                value={settings.katagoBatchSize}
                                                onChange={(e) => updateSettings({ katagoBatchSize: Math.max(1, parseInt(e.target.value || '0', 10)) })}
                                                className={inputClass}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-slate-300 block text-sm">Max Children</label>
                                            <input
                                                type="number"
                                                min={4}
                                                max={361}
                                                value={settings.katagoMaxChildren}
                                                onChange={(e) => updateSettings({ katagoMaxChildren: Math.max(4, parseInt(e.target.value || '0', 10)) })}
                                                className={inputClass}
                                            />
                                        </div>
                                    </div>

                                    <div className="mt-3 space-y-1">
                                        <label className="text-slate-300 block text-sm">Top Moves</label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={50}
                                            value={settings.katagoTopK}
                                            onChange={(e) => updateSettings({ katagoTopK: Math.max(1, parseInt(e.target.value || '0', 10)) })}
                                            className={inputClass}
                                        />
                                    </div>

                                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-slate-300 block text-sm">Wide Root Noise</label>
                                            <input
                                                type="number"
                                                min={0}
                                                step={0.01}
                                                value={settings.katagoWideRootNoise}
                                                onChange={(e) => updateSettings({ katagoWideRootNoise: Math.max(0, parseFloat(e.target.value || '0')) })}
                                                className={inputClass}
                                            />
                                            <p className={subtextClass}>KaTrain default is 0.04; set 0 for strongest/most stable.</p>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-slate-300 block text-sm">PV Len</label>
                                            <input
                                                type="number"
                                                min={0}
                                                max={60}
                                                step={1}
                                                value={settings.katagoAnalysisPvLen}
                                                onChange={(e) => updateSettings({ katagoAnalysisPvLen: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                                                className={inputClass}
                                            />
                                            <p className={subtextClass}>KataGo analysisPVLen (moves after the first).</p>
                                        </div>
                                    </div>

                                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-slate-300 block text-sm">Ownership</label>
                                            <select
                                                value={settings.katagoOwnershipMode}
                                                onChange={(e) => updateSettings({ katagoOwnershipMode: e.target.value as 'root' | 'tree' })}
                                                className={selectClass}
                                            >
                                                <option value="tree">Tree-averaged (KaTrain)</option>
                                                <option value="root">Root-only (faster)</option>
                                            </select>
                                            <p className={subtextClass}>
                                                KaTrain uses tree-averaged ownership; root-only disables per-move ownership for speed.
                                            </p>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-slate-300 block text-sm">Reuse Search Tree</label>
                                            <label className="flex items-center space-x-2 text-sm text-slate-300">
                                                <input
                                                    type="checkbox"
                                                    checked={settings.katagoReuseTree}
                                                    onChange={(e) => updateSettings({ katagoReuseTree: e.target.checked })}
                                                    className="rounded"
                                                />
                                                <span>Enable (faster)</span>
                                            </label>
                                            <p className={subtextClass}>
                                                Speeds up continuous analysis by continuing from previous visits.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-3 space-y-1">
                                        <label className="text-slate-300 block text-sm">Randomize Symmetry</label>
                                        <label className="flex items-center space-x-2 text-sm text-slate-300">
                                            <input
                                                type="checkbox"
                                                checked={settings.katagoNnRandomize}
                                                onChange={(e) => updateSettings({ katagoNnRandomize: e.target.checked })}
                                                className="rounded"
                                            />
                                            <span>Enable (nnRandomize)</span>
                                        </label>
                                        <p className={subtextClass}>
                                            Matches KataGo defaults; disable for deterministic/stable analysis.
                                        </p>
                                    </div>

                                    <div className="mt-3 space-y-1">
                                        <label className="text-slate-300 block text-sm">Conservative Pass</label>
                                        <label className="flex items-center space-x-2 text-sm text-slate-300">
                                            <input
                                                type="checkbox"
                                                checked={settings.katagoConservativePass}
                                                onChange={(e) => updateSettings({ katagoConservativePass: e.target.checked })}
                                                className="rounded"
                                            />
                                            <span>Enable (conservativePass)</span>
                                        </label>
                                        <p className={subtextClass}>
                                            KaTrain default: suppresses “pass ends game” features at the root.
                                        </p>
                                    </div>
                                </div>  
                            </>  
                        )}  
                    </div>  
                </div>
                <div className="sticky bottom-0 z-10 flex justify-end px-4 sm:px-6 py-4 ui-panel border-t backdrop-blur">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 rounded-lg ui-accent-bg hover:brightness-110 font-semibold shadow-lg shadow-black/20 transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};
