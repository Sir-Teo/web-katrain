import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NewGameModal, type AiConfigValues, type GameInfoValues, type TimerConfigValues } from '../src/components/NewGameModal';
import { useGameStore } from '../src/store/gameStore';
import type { GameSettings, Player } from '../src/types';

const settings = useGameStore.getState().settings;

const defaultInfo: GameInfoValues = {
  blackName: '',
  whiteName: '',
  blackRank: '',
  whiteRank: '',
  event: '',
  date: '',
  place: '',
  gameName: '',
};

function aiConfig(args: {
  opponent?: 'none' | Player;
  strategy?: GameSettings['aiStrategy'];
} = {}): AiConfigValues {
  return {
    opponent: args.opponent ?? 'none',
    aiStrategy: args.strategy ?? settings.aiStrategy,
    aiRankKyu: settings.aiRankKyu,
    aiScoreLossStrength: settings.aiScoreLossStrength,
    aiPolicyOpeningMoves: settings.aiPolicyOpeningMoves,
    aiWeightedPickOverride: settings.aiWeightedPickOverride,
    aiWeightedWeakenFac: settings.aiWeightedWeakenFac,
    aiWeightedLowerBound: settings.aiWeightedLowerBound,
    aiPickPickOverride: settings.aiPickPickOverride,
    aiPickPickN: settings.aiPickPickN,
    aiPickPickFrac: settings.aiPickPickFrac,
    aiLocalPickOverride: settings.aiLocalPickOverride,
    aiLocalStddev: settings.aiLocalStddev,
    aiLocalPickN: settings.aiLocalPickN,
    aiLocalPickFrac: settings.aiLocalPickFrac,
    aiLocalEndgame: settings.aiLocalEndgame,
    aiTenukiPickOverride: settings.aiTenukiPickOverride,
    aiTenukiStddev: settings.aiTenukiStddev,
    aiTenukiPickN: settings.aiTenukiPickN,
    aiTenukiPickFrac: settings.aiTenukiPickFrac,
    aiTenukiEndgame: settings.aiTenukiEndgame,
    aiInfluencePickOverride: settings.aiInfluencePickOverride,
    aiInfluencePickN: settings.aiInfluencePickN,
    aiInfluencePickFrac: settings.aiInfluencePickFrac,
    aiInfluenceThreshold: settings.aiInfluenceThreshold,
    aiInfluenceLineWeight: settings.aiInfluenceLineWeight,
    aiInfluenceEndgame: settings.aiInfluenceEndgame,
    aiTerritoryPickOverride: settings.aiTerritoryPickOverride,
    aiTerritoryPickN: settings.aiTerritoryPickN,
    aiTerritoryPickFrac: settings.aiTerritoryPickFrac,
    aiTerritoryThreshold: settings.aiTerritoryThreshold,
    aiTerritoryLineWeight: settings.aiTerritoryLineWeight,
    aiTerritoryEndgame: settings.aiTerritoryEndgame,
    aiJigoTargetScore: settings.aiJigoTargetScore,
    aiOwnershipMaxPointsLost: settings.aiOwnershipMaxPointsLost,
    aiOwnershipSettledWeight: settings.aiOwnershipSettledWeight,
    aiOwnershipOpponentFac: settings.aiOwnershipOpponentFac,
    aiOwnershipMinVisits: settings.aiOwnershipMinVisits,
    aiOwnershipAttachPenalty: settings.aiOwnershipAttachPenalty,
    aiOwnershipTenukiPenalty: settings.aiOwnershipTenukiPenalty,
  };
}

function renderModal(args: {
  ai?: AiConfigValues;
  timer?: TimerConfigValues;
} = {}): string {
  return renderToStaticMarkup(
    <NewGameModal
      onClose={() => undefined}
      onStart={() => undefined}
      defaultKomi={6.5}
      defaultRules="japanese"
      defaultBoardSize={19}
      defaultHandicap={0}
      defaultInfo={defaultInfo}
      defaultAiConfig={args.ai ?? aiConfig()}
      defaultTimerConfig={args.timer ?? { mode: 'none', mainTimeMinutes: 0, byoLengthSeconds: 30, byoPeriods: 5 }}
    />
  );
}

function expectLabelPair(html: string, id: string, label: string): void {
  expect(html).toContain(`for="${id}"`);
  expect(html).toContain(`id="${id}"`);
  expect(html).toContain(`>${label}</label>`);
}

describe('NewGameModal', () => {
  it('binds labels to the core game setup controls', () => {
    const html = renderModal({
      timer: { mode: 'byo-yomi', mainTimeMinutes: 5, byoLengthSeconds: 30, byoPeriods: 5 },
    });

    [
      ['new-game-black-name', 'Black'],
      ['new-game-white-name', 'White'],
      ['new-game-black-rank', 'Black Rank'],
      ['new-game-white-rank', 'White Rank'],
      ['new-game-event', 'Event'],
      ['new-game-date', 'Date'],
      ['new-game-place', 'Place'],
      ['new-game-name', 'Game Name'],
      ['new-game-board-size', 'Board Size'],
      ['new-game-rules', 'Rules'],
      ['new-game-komi', 'Komi'],
      ['new-game-handicap', 'Handicap Stones'],
      ['new-game-time-system', 'Time system'],
      ['new-game-main-time', 'Main time (min)'],
      ['new-game-byo-yomi', 'Byo-yomi (sec)'],
      ['new-game-byo-periods', 'Periods'],
      ['new-game-opponent', 'Play against'],
    ].forEach(([id, label]) => expectLabelPair(html, id!, label!));
  });

  it('binds labels for AI opponent setup controls', () => {
    const rankHtml = renderModal({ ai: aiConfig({ opponent: 'white', strategy: 'rank' }) });
    expectLabelPair(rankHtml, 'new-game-human-name', 'Your name (Black)');
    expectLabelPair(rankHtml, 'new-game-ai-name', 'AI name (White)');
    expectLabelPair(rankHtml, 'new-game-human-rank', 'Your rank (optional)');
    expectLabelPair(rankHtml, 'new-game-ai-strategy', 'Strategy');
    expectLabelPair(rankHtml, 'new-game-ai-rank-target', 'Strength (rank target)');

    const scoreLossHtml = renderModal({ ai: aiConfig({ opponent: 'black', strategy: 'scoreloss' }) });
    expectLabelPair(scoreLossHtml, 'new-game-ai-scoreloss-strength', 'Strength (c)');

    const jigoHtml = renderModal({ ai: aiConfig({ opponent: 'white', strategy: 'jigo' }) });
    expectLabelPair(jigoHtml, 'new-game-ai-target-score', 'Target Score');
  });
});
