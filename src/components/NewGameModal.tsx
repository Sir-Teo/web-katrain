import React from 'react';
import type { BoardSize, GameRules, GameSettings, Player } from '../types';
import { BOARD_SIZES, getMaxHandicap } from '../utils/boardSize';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

export type GameInfoValues = {
  blackName: string;
  whiteName: string;
  blackRank: string;
  whiteRank: string;
  event: string;
  date: string;
  place: string;
  gameName: string;
};

export type AiOpponent = 'none' | Player;

export type AiConfigValues = {
  opponent: AiOpponent;
} & Pick<
  GameSettings,
  | 'aiStrategy'
  | 'aiRankKyu'
  | 'aiScoreLossStrength'
  | 'aiPolicyOpeningMoves'
  | 'aiWeightedPickOverride'
  | 'aiWeightedWeakenFac'
  | 'aiWeightedLowerBound'
  | 'aiPickPickOverride'
  | 'aiPickPickN'
  | 'aiPickPickFrac'
  | 'aiLocalPickOverride'
  | 'aiLocalStddev'
  | 'aiLocalPickN'
  | 'aiLocalPickFrac'
  | 'aiLocalEndgame'
  | 'aiTenukiPickOverride'
  | 'aiTenukiStddev'
  | 'aiTenukiPickN'
  | 'aiTenukiPickFrac'
  | 'aiTenukiEndgame'
  | 'aiInfluencePickOverride'
  | 'aiInfluencePickN'
  | 'aiInfluencePickFrac'
  | 'aiInfluenceThreshold'
  | 'aiInfluenceLineWeight'
  | 'aiInfluenceEndgame'
  | 'aiTerritoryPickOverride'
  | 'aiTerritoryPickN'
  | 'aiTerritoryPickFrac'
  | 'aiTerritoryThreshold'
  | 'aiTerritoryLineWeight'
  | 'aiTerritoryEndgame'
  | 'aiJigoTargetScore'
  | 'aiOwnershipMaxPointsLost'
  | 'aiOwnershipSettledWeight'
  | 'aiOwnershipOpponentFac'
  | 'aiOwnershipMinVisits'
  | 'aiOwnershipAttachPenalty'
  | 'aiOwnershipTenukiPenalty'
>;

export type TimerConfigValues = {
  mode: 'none' | 'byo-yomi';
  mainTimeMinutes: number;
  byoLengthSeconds: number;
  byoPeriods: number;
};

interface NewGameModalProps {
  onClose: () => void;
  onStart: (opts: {
    komi: number;
    rules: GameRules;
    boardSize: BoardSize;
    handicap: number;
    info: GameInfoValues;
    aiConfig: AiConfigValues;
    timerConfig: TimerConfigValues;
  }) => void;
  defaultKomi: number;
  defaultRules: GameRules;
  defaultBoardSize: BoardSize;
  defaultHandicap: number;
  defaultInfo: GameInfoValues;
  defaultAiConfig: AiConfigValues;
  defaultTimerConfig: TimerConfigValues;
}

export const NewGameModal: React.FC<NewGameModalProps> = ({
  onClose,
  onStart,
  defaultKomi,
  defaultRules,
  defaultBoardSize,
  defaultHandicap,
  defaultInfo,
  defaultAiConfig,
  defaultTimerConfig,
}) => {
  useEscapeToClose(onClose);
  const [komi, setKomi] = React.useState(() => defaultKomi);
  const [rules, setRules] = React.useState<GameRules>(() => defaultRules);
  const [boardSize, setBoardSize] = React.useState<BoardSize>(() => defaultBoardSize);
  const [handicap, setHandicap] = React.useState(() => defaultHandicap);
  const [gameInfo, setGameInfo] = React.useState<GameInfoValues>(() => defaultInfo);
  const [aiConfig, setAiConfig] = React.useState<AiConfigValues>(() => defaultAiConfig);
  const [timerConfig, setTimerConfig] = React.useState<TimerConfigValues>(() => defaultTimerConfig);
  const maxHandicap = React.useMemo(() => getMaxHandicap(boardSize), [boardSize]);

  const showAiOptions = aiConfig.opponent !== 'none';
  const updateAiConfig = (patch: Partial<AiConfigValues>) =>
    setAiConfig((prev) => ({ ...prev, ...patch }));
  const updateTimerConfig = (patch: Partial<TimerConfigValues>) =>
    setTimerConfig((prev) => ({ ...prev, ...patch }));
  const aiColor = aiConfig.opponent === 'none' ? null : aiConfig.opponent;
  const humanColor = aiColor === 'black' ? 'white' : aiColor === 'white' ? 'black' : null;

  React.useEffect(() => {
    setHandicap((prev) => Math.max(0, Math.min(prev, maxHandicap)));
  }, [maxHandicap]);

  React.useEffect(() => {
    if (!aiColor) return;
    setGameInfo((prev) => {
      const aiNameKey = aiColor === 'black' ? 'blackName' : 'whiteName';
      if (prev[aiNameKey].trim()) return prev;
      return { ...prev, [aiNameKey]: 'KataGo' };
    });
  }, [aiColor]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        className="ui-panel rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden border flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-game-title"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--ui-border)] ui-bar">
          <h2 id="new-game-title" className="text-lg font-semibold text-[var(--ui-text)]">New Game</h2>
          <button type="button" onClick={onClose} className="ui-text-faint hover:text-[var(--ui-text)]" aria-label="Close new game">✕</button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-wide ui-text-faint">Game Info</div>
            {showAiOptions && humanColor ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[var(--ui-text-muted)] text-sm">Your name ({humanColor === 'black' ? 'Black' : 'White'})</label>
                    <input
                      value={humanColor === 'black' ? gameInfo.blackName : gameInfo.whiteName}
                      onChange={(e) =>
                        setGameInfo((prev) => ({
                          ...prev,
                          [humanColor === 'black' ? 'blackName' : 'whiteName']: e.target.value,
                        }))
                      }
                      className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                      placeholder="Your name"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[var(--ui-text-muted)] text-sm">AI name ({aiColor === 'black' ? 'Black' : 'White'})</label>
                    <input
                      value={aiColor === 'black' ? gameInfo.blackName : gameInfo.whiteName}
                      onChange={(e) =>
                        setGameInfo((prev) => ({
                          ...prev,
                          [aiColor === 'black' ? 'blackName' : 'whiteName']: e.target.value,
                        }))
                      }
                      className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                      placeholder="KataGo"
                    />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="text-[var(--ui-text-muted)] text-sm">Your rank (optional)</label>
                    <input
                      value={humanColor === 'black' ? gameInfo.blackRank : gameInfo.whiteRank}
                      onChange={(e) =>
                        setGameInfo((prev) => ({
                          ...prev,
                          [humanColor === 'black' ? 'blackRank' : 'whiteRank']: e.target.value,
                        }))
                      }
                      className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                      placeholder="Rank"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[var(--ui-text-muted)] text-sm">Black</label>
                  <input
                    value={gameInfo.blackName}
                    onChange={(e) => setGameInfo((prev) => ({ ...prev, blackName: e.target.value }))}
                    className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                    placeholder="Black player"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[var(--ui-text-muted)] text-sm">White</label>
                  <input
                    value={gameInfo.whiteName}
                    onChange={(e) => setGameInfo((prev) => ({ ...prev, whiteName: e.target.value }))}
                    className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                    placeholder="White player"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[var(--ui-text-muted)] text-sm">Black Rank</label>
                  <input
                    value={gameInfo.blackRank}
                    onChange={(e) => setGameInfo((prev) => ({ ...prev, blackRank: e.target.value }))}
                    className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                    placeholder="Rank"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[var(--ui-text-muted)] text-sm">White Rank</label>
                  <input
                    value={gameInfo.whiteRank}
                    onChange={(e) => setGameInfo((prev) => ({ ...prev, whiteRank: e.target.value }))}
                    className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                    placeholder="Rank"
                  />
                </div>
              </div>
            )}
            <details className="rounded-lg border border-[var(--ui-border)] ui-panel px-3 py-2">
              <summary className="text-sm text-[var(--ui-text)] cursor-pointer select-none">
                Event details (optional)
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[var(--ui-text-muted)] text-sm">Event</label>
                  <input
                    value={gameInfo.event}
                    onChange={(e) => setGameInfo((prev) => ({ ...prev, event: e.target.value }))}
                    className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                    placeholder="Event"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[var(--ui-text-muted)] text-sm">Date</label>
                  <input
                    value={gameInfo.date}
                    onChange={(e) => setGameInfo((prev) => ({ ...prev, date: e.target.value }))}
                    className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                    placeholder="YYYY-MM-DD"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[var(--ui-text-muted)] text-sm">Place</label>
                  <input
                    value={gameInfo.place}
                    onChange={(e) => setGameInfo((prev) => ({ ...prev, place: e.target.value }))}
                    className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                    placeholder="Location"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[var(--ui-text-muted)] text-sm">Game Name</label>
                  <input
                    value={gameInfo.gameName}
                    onChange={(e) => setGameInfo((prev) => ({ ...prev, gameName: e.target.value }))}
                    className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                    placeholder="Game name"
                  />
                </div>
              </div>
            </details>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[var(--ui-text-muted)] text-sm">Board Size</label>
              <select
                value={boardSize}
                onChange={(e) => setBoardSize(Number(e.target.value) as BoardSize)}
                className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
              >
                {BOARD_SIZES.map((size) => (
                  <option key={size} value={size}>{size}×{size}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[var(--ui-text-muted)] text-sm">Rules</label>
              <select
                value={rules}
                onChange={(e) => setRules(e.target.value as GameRules)}
                className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
              >
                <option value="japanese">Japanese</option>
                <option value="chinese">Chinese</option>
                <option value="korean">Korean</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[var(--ui-text-muted)] text-sm">Komi</label>
              <input
                type="number"
                step="0.5"
                value={komi}
                onChange={(e) => setKomi(Number(e.target.value))}
                className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[var(--ui-text-muted)] text-sm">Handicap Stones</label>
              <input
                type="number"
                min={0}
                max={maxHandicap}
                step={1}
                value={handicap}
                onChange={(e) => {
                  const next = Number.parseInt(e.target.value || '0', 10);
                  setHandicap(Math.max(0, Math.min(Number.isFinite(next) ? next : 0, maxHandicap)));
                }}
                className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
              />
              <div className="text-[11px] ui-text-faint">Placed on star points; White plays first.</div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-wide ui-text-faint">Clock</div>
            <div className="space-y-1">
              <label className="text-[var(--ui-text-muted)] text-sm">Time system</label>
              <select
                value={timerConfig.mode}
                onChange={(e) => {
                  const mode = e.target.value as TimerConfigValues['mode'];
                  setTimerConfig((prev) => {
                    if (mode !== 'byo-yomi') return { ...prev, mode };
                    return {
                      ...prev,
                      mode,
                      mainTimeMinutes: Math.max(0, prev.mainTimeMinutes),
                      byoLengthSeconds: prev.byoLengthSeconds > 0 ? prev.byoLengthSeconds : 30,
                      byoPeriods: prev.byoPeriods > 0 ? prev.byoPeriods : 5,
                    };
                  });
                }}
                className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
              >
                <option value="none">No timer</option>
                <option value="byo-yomi">Byo-yomi (Japanese)</option>
              </select>
            </div>
            {timerConfig.mode === 'byo-yomi' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[var(--ui-text-muted)] text-sm">Main time (min)</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={timerConfig.mainTimeMinutes}
                      onChange={(e) =>
                        updateTimerConfig({
                          mainTimeMinutes: Math.max(0, parseFloat(e.target.value || '0')),
                        })
                      }
                      className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[var(--ui-text-muted)] text-sm">Byo-yomi (sec)</label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={timerConfig.byoLengthSeconds}
                      onChange={(e) =>
                        updateTimerConfig({
                          byoLengthSeconds: Math.max(1, parseInt(e.target.value || '1', 10)),
                        })
                      }
                      className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[var(--ui-text-muted)] text-sm">Periods</label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={timerConfig.byoPeriods}
                      onChange={(e) =>
                        updateTimerConfig({
                          byoPeriods: Math.max(1, parseInt(e.target.value || '1', 10)),
                        })
                      }
                      className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                    />
                  </div>
                </div>
                <div className="text-xs ui-text-faint">
                  Main time then {timerConfig.byoPeriods} periods of {timerConfig.byoLengthSeconds} seconds.
                </div>
              </>
            )}
          </div>
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-wide ui-text-faint">Opponent</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <label className="text-[var(--ui-text-muted)] text-sm">Play against</label>
                <select
                  value={aiConfig.opponent}
                  onChange={(e) => updateAiConfig({ opponent: e.target.value as AiOpponent })}
                  className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                >
                  <option value="none">Human (local)</option>
                  <option value="black">AI as Black</option>
                  <option value="white">AI as White</option>
                </select>
              </div>
            </div>
            {showAiOptions && (
              <>
                <div className="text-xs ui-text-faint">
                  You play as {humanColor === 'black' ? 'Black' : 'White'}.
                </div>
                <div className="space-y-1">
                  <label className="text-[var(--ui-text-muted)] text-sm">Strategy</label>
                  <select
                    value={aiConfig.aiStrategy}
                    onChange={(e) => updateAiConfig({ aiStrategy: e.target.value as GameSettings['aiStrategy'] })}
                    className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                  >
                    <option value="default">Default (engine top move)</option>
                    <option value="rank">Rank (KaTrain)</option>
                    <option value="simple">Simple Ownership</option>
                    <option value="settle">Settle Stones</option>
                    <option value="scoreloss">ScoreLoss (weaker)</option>
                    <option value="policy">Policy</option>
                    <option value="weighted">Policy Weighted</option>
                    <option value="jigo">Jigo</option>
                    <option value="pick">Pick</option>
                    <option value="local">Local</option>
                    <option value="tenuki">Tenuki</option>
                    <option value="territory">Territory</option>
                    <option value="influence">Influence</option>
                  </select>
                </div>
                {aiConfig.aiStrategy === 'rank' && (
                  <div className="space-y-1">
                    <label className="text-[var(--ui-text-muted)] text-sm">Strength (rank target)</label>
                    <input
                      type="number"
                      step={0.5}
                      value={aiConfig.aiRankKyu}
                      onChange={(e) => updateAiConfig({ aiRankKyu: parseFloat(e.target.value || '0') })}
                      className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                    />
                    <div className="text-xs ui-text-faint">Higher = weaker. Example: 4 ≈ 4k, 0 ≈ 1d.</div>
                  </div>
                )}
                {aiConfig.aiStrategy === 'scoreloss' && (
                  <div className="space-y-1">
                    <label className="text-[var(--ui-text-muted)] text-sm">Strength (c)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.05}
                      value={aiConfig.aiScoreLossStrength}
                      onChange={(e) => updateAiConfig({ aiScoreLossStrength: Math.max(0, parseFloat(e.target.value || '0')) })}
                      className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                    />
                    <div className="text-xs ui-text-faint">Higher = stronger, lower = more random.</div>
                  </div>
                )}
                {aiConfig.aiStrategy === 'jigo' && (
                  <div className="space-y-1">
                    <label className="text-[var(--ui-text-muted)] text-sm">Target Score</label>
                    <input
                      type="number"
                      step={0.1}
                      value={aiConfig.aiJigoTargetScore}
                      onChange={(e) => updateAiConfig({ aiJigoTargetScore: parseFloat(e.target.value || '0') })}
                      className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                    />
                    <div className="text-xs ui-text-faint">AI aims for this score lead (for the side to play).</div>
                  </div>
                )}
                {aiConfig.aiStrategy === 'default' && (
                  <div className="text-xs ui-text-faint">
                    Strength is fixed by the engine for this strategy.
                  </div>
                )}
                {(aiConfig.aiStrategy === 'policy' ||
                  aiConfig.aiStrategy === 'weighted' ||
                  aiConfig.aiStrategy === 'pick' ||
                  aiConfig.aiStrategy === 'local' ||
                  aiConfig.aiStrategy === 'tenuki' ||
                  aiConfig.aiStrategy === 'territory' ||
                  aiConfig.aiStrategy === 'influence' ||
                  aiConfig.aiStrategy === 'simple' ||
                  aiConfig.aiStrategy === 'settle') && (
                  <div className="text-xs ui-text-faint">
                    Strength depends on strategy settings below.
                  </div>
                )}
                {(aiConfig.aiStrategy === 'simple' ||
                  aiConfig.aiStrategy === 'settle' ||
                  aiConfig.aiStrategy === 'policy' ||
                  aiConfig.aiStrategy === 'weighted' ||
                  aiConfig.aiStrategy === 'pick' ||
                  aiConfig.aiStrategy === 'local' ||
                  aiConfig.aiStrategy === 'tenuki' ||
                  aiConfig.aiStrategy === 'territory' ||
                  aiConfig.aiStrategy === 'influence') && (
                  <details className="rounded-lg border border-[var(--ui-border)] ui-panel px-3 py-2">
                    <summary className="text-sm text-[var(--ui-text)] cursor-pointer select-none">
                      Advanced AI settings
                    </summary>
                    <div className="mt-3 space-y-3">
                      {(aiConfig.aiStrategy === 'simple' || aiConfig.aiStrategy === 'settle') && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[var(--ui-text-muted)] text-sm">Max Pt Lost</label>
                            <input
                              type="number"
                              min={0}
                              step={0.25}
                              value={aiConfig.aiOwnershipMaxPointsLost}
                              onChange={(e) => updateAiConfig({ aiOwnershipMaxPointsLost: Math.max(0, parseFloat(e.target.value || '0')) })}
                              className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[var(--ui-text-muted)] text-sm">Settled Wt</label>
                            <input
                              type="number"
                              min={0}
                              step={0.25}
                              value={aiConfig.aiOwnershipSettledWeight}
                              onChange={(e) => updateAiConfig({ aiOwnershipSettledWeight: Math.max(0, parseFloat(e.target.value || '0')) })}
                              className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[var(--ui-text-muted)] text-sm">Opp Fac</label>
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={aiConfig.aiOwnershipOpponentFac}
                              onChange={(e) => updateAiConfig({ aiOwnershipOpponentFac: Math.max(0, parseFloat(e.target.value || '0')) })}
                              className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[var(--ui-text-muted)] text-sm">Min Visits</label>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={aiConfig.aiOwnershipMinVisits}
                              onChange={(e) => updateAiConfig({ aiOwnershipMinVisits: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                              className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[var(--ui-text-muted)] text-sm">Attach Pen</label>
                            <input
                              type="number"
                              min={0}
                              step={0.25}
                              value={aiConfig.aiOwnershipAttachPenalty}
                              onChange={(e) => updateAiConfig({ aiOwnershipAttachPenalty: Math.max(0, parseFloat(e.target.value || '0')) })}
                              className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[var(--ui-text-muted)] text-sm">Tenuki Pen</label>
                            <input
                              type="number"
                              min={0}
                              step={0.25}
                              value={aiConfig.aiOwnershipTenukiPenalty}
                              onChange={(e) => updateAiConfig({ aiOwnershipTenukiPenalty: Math.max(0, parseFloat(e.target.value || '0')) })}
                              className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                            />
                          </div>
                        </div>
                      )}
                      {aiConfig.aiStrategy === 'policy' && (
                        <div className="space-y-1">
                          <label className="text-[var(--ui-text-muted)] text-sm">Opening Moves</label>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={aiConfig.aiPolicyOpeningMoves}
                            onChange={(e) => updateAiConfig({ aiPolicyOpeningMoves: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                            className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                          />
                        </div>
                      )}
                      {aiConfig.aiStrategy === 'weighted' && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[var(--ui-text-muted)] text-sm">Override</label>
                            <input
                              type="number"
                              min={0}
                              max={1}
                              step={0.01}
                              value={aiConfig.aiWeightedPickOverride}
                              onChange={(e) => updateAiConfig({ aiWeightedPickOverride: Math.max(0, Math.min(1, parseFloat(e.target.value || '0'))) })}
                              className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[var(--ui-text-muted)] text-sm">Weaken</label>
                            <input
                              type="number"
                              min={0.01}
                              step={0.05}
                              value={aiConfig.aiWeightedWeakenFac}
                              onChange={(e) => updateAiConfig({ aiWeightedWeakenFac: Math.max(0.01, parseFloat(e.target.value || '0')) })}
                              className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[var(--ui-text-muted)] text-sm">Lower</label>
                            <input
                              type="number"
                              min={0}
                              step={0.001}
                              value={aiConfig.aiWeightedLowerBound}
                              onChange={(e) => updateAiConfig({ aiWeightedLowerBound: Math.max(0, parseFloat(e.target.value || '0')) })}
                              className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                            />
                          </div>
                        </div>
                      )}
                      {aiConfig.aiStrategy === 'pick' && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[var(--ui-text-muted)] text-sm">Override</label>
                            <input
                              type="number"
                              min={0}
                              max={1}
                              step={0.01}
                              value={aiConfig.aiPickPickOverride}
                              onChange={(e) => updateAiConfig({ aiPickPickOverride: Math.max(0, Math.min(1, parseFloat(e.target.value || '0'))) })}
                              className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[var(--ui-text-muted)] text-sm">Pick N</label>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={aiConfig.aiPickPickN}
                              onChange={(e) => updateAiConfig({ aiPickPickN: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                              className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[var(--ui-text-muted)] text-sm">Pick Frac</label>
                            <input
                              type="number"
                              min={0}
                              max={1}
                              step={0.05}
                              value={aiConfig.aiPickPickFrac}
                              onChange={(e) => updateAiConfig({ aiPickPickFrac: Math.max(0, Math.min(1, parseFloat(e.target.value || '0'))) })}
                              className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                            />
                          </div>
                        </div>
                      )}
                      {aiConfig.aiStrategy === 'local' && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[var(--ui-text-muted)] text-sm">Override</label>
                            <input
                              type="number"
                              min={0}
                              max={1}
                              step={0.01}
                              value={aiConfig.aiLocalPickOverride}
                              onChange={(e) => updateAiConfig({ aiLocalPickOverride: Math.max(0, Math.min(1, parseFloat(e.target.value || '0'))) })}
                              className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[var(--ui-text-muted)] text-sm">Stddev</label>
                            <input
                              type="number"
                              min={0.1}
                              step={0.5}
                              value={aiConfig.aiLocalStddev}
                              onChange={(e) => updateAiConfig({ aiLocalStddev: Math.max(0.1, parseFloat(e.target.value || '0')) })}
                              className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[var(--ui-text-muted)] text-sm">Endgame</label>
                            <input
                              type="number"
                              min={0}
                              max={1}
                              step={0.05}
                              value={aiConfig.aiLocalEndgame}
                              onChange={(e) => updateAiConfig({ aiLocalEndgame: Math.max(0, Math.min(1, parseFloat(e.target.value || '0'))) })}
                              className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[var(--ui-text-muted)] text-sm">Pick N</label>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={aiConfig.aiLocalPickN}
                              onChange={(e) => updateAiConfig({ aiLocalPickN: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                              className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[var(--ui-text-muted)] text-sm">Pick Frac</label>
                            <input
                              type="number"
                              min={0}
                              max={1}
                              step={0.05}
                              value={aiConfig.aiLocalPickFrac}
                              onChange={(e) => updateAiConfig({ aiLocalPickFrac: Math.max(0, Math.min(1, parseFloat(e.target.value || '0'))) })}
                              className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                            />
                          </div>
                        </div>
                      )}
                      {aiConfig.aiStrategy === 'tenuki' && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[var(--ui-text-muted)] text-sm">Override</label>
                            <input
                              type="number"
                              min={0}
                              max={1}
                              step={0.01}
                              value={aiConfig.aiTenukiPickOverride}
                              onChange={(e) => updateAiConfig({ aiTenukiPickOverride: Math.max(0, Math.min(1, parseFloat(e.target.value || '0'))) })}
                              className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[var(--ui-text-muted)] text-sm">Stddev</label>
                            <input
                              type="number"
                              min={0.1}
                              step={0.5}
                              value={aiConfig.aiTenukiStddev}
                              onChange={(e) => updateAiConfig({ aiTenukiStddev: Math.max(0.1, parseFloat(e.target.value || '0')) })}
                              className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[var(--ui-text-muted)] text-sm">Endgame</label>
                            <input
                              type="number"
                              min={0}
                              max={1}
                              step={0.05}
                              value={aiConfig.aiTenukiEndgame}
                              onChange={(e) => updateAiConfig({ aiTenukiEndgame: Math.max(0, Math.min(1, parseFloat(e.target.value || '0'))) })}
                              className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[var(--ui-text-muted)] text-sm">Pick N</label>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={aiConfig.aiTenukiPickN}
                              onChange={(e) => updateAiConfig({ aiTenukiPickN: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                              className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[var(--ui-text-muted)] text-sm">Pick Frac</label>
                            <input
                              type="number"
                              min={0}
                              max={1}
                              step={0.05}
                              value={aiConfig.aiTenukiPickFrac}
                              onChange={(e) => updateAiConfig({ aiTenukiPickFrac: Math.max(0, Math.min(1, parseFloat(e.target.value || '0'))) })}
                              className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                            />
                          </div>
                        </div>
                      )}
                      {(aiConfig.aiStrategy === 'territory' || aiConfig.aiStrategy === 'influence') && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[var(--ui-text-muted)] text-sm">Override</label>
                            <input
                              type="number"
                              min={0}
                              max={1}
                              step={0.01}
                              value={aiConfig.aiStrategy === 'influence' ? aiConfig.aiInfluencePickOverride : aiConfig.aiTerritoryPickOverride}
                              onChange={(e) => {
                                const v = Math.max(0, Math.min(1, parseFloat(e.target.value || '0')));
                                updateAiConfig(
                                  aiConfig.aiStrategy === 'influence'
                                    ? { aiInfluencePickOverride: v }
                                    : { aiTerritoryPickOverride: v }
                                );
                              }}
                              className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[var(--ui-text-muted)] text-sm">Threshold</label>
                            <input
                              type="number"
                              min={0}
                              step={0.5}
                              value={aiConfig.aiStrategy === 'influence' ? aiConfig.aiInfluenceThreshold : aiConfig.aiTerritoryThreshold}
                              onChange={(e) => {
                                const v = Math.max(0, parseFloat(e.target.value || '0'));
                                updateAiConfig(
                                  aiConfig.aiStrategy === 'influence'
                                    ? { aiInfluenceThreshold: v }
                                    : { aiTerritoryThreshold: v }
                                );
                              }}
                              className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[var(--ui-text-muted)] text-sm">Line Wt</label>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={aiConfig.aiStrategy === 'influence' ? aiConfig.aiInfluenceLineWeight : aiConfig.aiTerritoryLineWeight}
                              onChange={(e) => {
                                const v = Math.max(0, parseInt(e.target.value || '0', 10));
                                updateAiConfig(
                                  aiConfig.aiStrategy === 'influence'
                                    ? { aiInfluenceLineWeight: v }
                                    : { aiTerritoryLineWeight: v }
                                );
                              }}
                              className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[var(--ui-text-muted)] text-sm">Pick N</label>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={aiConfig.aiStrategy === 'influence' ? aiConfig.aiInfluencePickN : aiConfig.aiTerritoryPickN}
                              onChange={(e) => {
                                const v = Math.max(0, parseInt(e.target.value || '0', 10));
                                updateAiConfig(
                                  aiConfig.aiStrategy === 'influence'
                                    ? { aiInfluencePickN: v }
                                    : { aiTerritoryPickN: v }
                                );
                              }}
                              className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[var(--ui-text-muted)] text-sm">Pick Frac</label>
                            <input
                              type="number"
                              min={0}
                              max={1}
                              step={0.05}
                              value={aiConfig.aiStrategy === 'influence' ? aiConfig.aiInfluencePickFrac : aiConfig.aiTerritoryPickFrac}
                              onChange={(e) => {
                                const v = Math.max(0, Math.min(1, parseFloat(e.target.value || '0')));
                                updateAiConfig(
                                  aiConfig.aiStrategy === 'influence'
                                    ? { aiInfluencePickFrac: v }
                                    : { aiTerritoryPickFrac: v }
                                );
                              }}
                              className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[var(--ui-text-muted)] text-sm">Endgame</label>
                            <input
                              type="number"
                              min={0}
                              max={1}
                              step={0.05}
                              value={aiConfig.aiStrategy === 'influence' ? aiConfig.aiInfluenceEndgame : aiConfig.aiTerritoryEndgame}
                              onChange={(e) => {
                                const v = Math.max(0, Math.min(1, parseFloat(e.target.value || '0')));
                                updateAiConfig(
                                  aiConfig.aiStrategy === 'influence'
                                    ? { aiInfluenceEndgame: v }
                                    : { aiTerritoryEndgame: v }
                                );
                              }}
                              className="w-full ui-input text-[var(--ui-text)] rounded px-2 py-2 text-sm border"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </>
            )}
          </div>
          <div className="text-xs ui-text-faint">
            Start a new {boardSize}×{boardSize} game with the selected rules and optional game info.
          </div>
        </div>
        <div className="px-4 py-3 border-t border-[var(--ui-border)] flex justify-end gap-2 ui-bar">
          <button type="button"
            className="px-3 py-2 rounded bg-[var(--ui-surface-2)] text-[var(--ui-text)] hover:brightness-110"
            onClick={onClose}
          >
            Cancel
          </button>
          <button type="button"
            className="px-3 py-2 rounded ui-accent-bg hover:brightness-110"
            onClick={() =>
              onStart({
                komi: Number.isFinite(komi) ? komi : defaultKomi,
                rules,
                boardSize,
                handicap,
                info: gameInfo,
                aiConfig,
                timerConfig,
              })
            }
          >
            Start
          </button>
        </div>
      </div>
    </div>
  );
};
