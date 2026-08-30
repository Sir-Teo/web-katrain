import { readFileSync } from 'node:fs';
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
    humanSlProfile: settings.humanSlProfile,
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
  handicap?: number;
} = {}): string {
  return renderToStaticMarkup(
    <NewGameModal
      onClose={() => undefined}
      onStart={() => undefined}
      defaultKomi={6.5}
      defaultRules="japanese"
      defaultBoardSize={19}
      defaultHandicap={args.handicap ?? 0}
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
  it('uses full touch targets for mobile game setup controls', () => {
    const html = renderModal();
    const css = readFileSync('src/index.css', 'utf8');

    expect(html).toContain('new-game-modal ui-panel');
    expect(css).toMatch(/@media \(max-width: 1023px\)[\s\S]*\.new-game-modal button,[\s\S]*\.new-game-modal input:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\),[\s\S]*min-height: 44px;/);
  });

  it('fits complete setup rows above the footer in short landscape', () => {
    const html = renderModal();
    const css = readFileSync('src/index.css', 'utf8');

    expect(html).toContain('new-game-modal-header');
    expect(html).toContain('new-game-modal-body');
    expect(html).toContain('new-game-modal-footer');
    expect(css).toMatch(/@media \(max-height: 520px\) and \(orientation: landscape\)[\s\S]*\.new-game-modal \{[^}]*max-height: calc\(100dvh - 16px\) !important;/);
    expect(css).toMatch(/\.new-game-modal-header,[\s\S]{0,100}\.new-game-modal-footer \{[^}]*padding-top: 8px !important;[^}]*padding-bottom: 8px !important;/);
    expect(css).toMatch(/\.new-game-modal-body \{[^}]*display: flex;[^}]*gap: 12px;[^}]*padding: 12px !important;/);
  });

  it('keeps optional player and record metadata collapsed by default', () => {
    const html = renderModal();
    const detailsTag = html.match(/<details[^>]*data-new-game-info-details="true"[^>]*>/)?.[0];

    expect(detailsTag).toBeDefined();
    expect(detailsTag).not.toContain(' open');
    expect(html).toContain('Players &amp; game info');
    expect(html).toContain('>Optional</span>');
    expect(html.indexOf('>Opponent</div>')).toBeLessThan(html.indexOf('>Clock</div>'));
  });

  it('describes the correct first player for the selected handicap', () => {
    const evenGame = renderModal();
    const handicapGame = renderModal({ handicap: 2 });

    expect(evenGame).toContain('Black plays first.');
    expect(evenGame).not.toContain('Placed on star points; White plays first.');
    expect(handicapGame).toContain('Placed on star points; White plays first.');
    expect(handicapGame).not.toContain('>Black plays first.</div>');
  });

  it('binds labels to the core game setup controls', () => {
    const html = renderModal({
      timer: { mode: 'byo-yomi', mainTimeMinutes: 5, byoLengthSeconds: 30, byoPeriods: 5 },
    });

    [
      ['new-game-black-name', 'Black'],
      ['new-game-white-name', 'White'],
      // Both rank fields are labelled just "Rank" under the Black/White column
      // heads; aria-label carries the colour for assistive tech (asserted below).
      ['new-game-black-rank', 'Rank'],
      ['new-game-white-rank', 'Rank'],
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

    expect(html).toContain('aria-label="Black rank"');
    expect(html).toContain('aria-label="White rank"');
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

  it('binds labels for advanced AI strategy controls', () => {
    const simpleHtml = renderModal({ ai: aiConfig({ opponent: 'white', strategy: 'simple' }) });
    [
      ['new-game-ai-ownership-max-points-lost', 'Max Pt Lost'],
      ['new-game-ai-ownership-settled-weight', 'Settled Wt'],
      ['new-game-ai-ownership-opponent-factor', 'Opp Fac'],
      ['new-game-ai-ownership-min-visits', 'Min Visits'],
      ['new-game-ai-ownership-attach-penalty', 'Attach Pen'],
      ['new-game-ai-ownership-tenuki-penalty', 'Tenuki Pen'],
    ].forEach(([id, label]) => expectLabelPair(simpleHtml, id!, label!));

    const policyHtml = renderModal({ ai: aiConfig({ opponent: 'white', strategy: 'policy' }) });
    expectLabelPair(policyHtml, 'new-game-ai-policy-opening-moves', 'Opening Moves');

    const weightedHtml = renderModal({ ai: aiConfig({ opponent: 'white', strategy: 'weighted' }) });
    [
      ['new-game-ai-weighted-override', 'Override'],
      ['new-game-ai-weighted-weaken', 'Weaken'],
      ['new-game-ai-weighted-lower', 'Lower'],
    ].forEach(([id, label]) => expectLabelPair(weightedHtml, id!, label!));

    const pickHtml = renderModal({ ai: aiConfig({ opponent: 'white', strategy: 'pick' }) });
    [
      ['new-game-ai-pick-override', 'Override'],
      ['new-game-ai-pick-n', 'Pick N'],
      ['new-game-ai-pick-frac', 'Pick Frac'],
    ].forEach(([id, label]) => expectLabelPair(pickHtml, id!, label!));

    const localHtml = renderModal({ ai: aiConfig({ opponent: 'white', strategy: 'local' }) });
    [
      ['new-game-ai-local-override', 'Override'],
      ['new-game-ai-local-stddev', 'Stddev'],
      ['new-game-ai-local-endgame', 'Endgame'],
      ['new-game-ai-local-pick-n', 'Pick N'],
      ['new-game-ai-local-pick-frac', 'Pick Frac'],
    ].forEach(([id, label]) => expectLabelPair(localHtml, id!, label!));

    const tenukiHtml = renderModal({ ai: aiConfig({ opponent: 'white', strategy: 'tenuki' }) });
    [
      ['new-game-ai-tenuki-override', 'Override'],
      ['new-game-ai-tenuki-stddev', 'Stddev'],
      ['new-game-ai-tenuki-endgame', 'Endgame'],
      ['new-game-ai-tenuki-pick-n', 'Pick N'],
      ['new-game-ai-tenuki-pick-frac', 'Pick Frac'],
    ].forEach(([id, label]) => expectLabelPair(tenukiHtml, id!, label!));

    const influenceHtml = renderModal({ ai: aiConfig({ opponent: 'white', strategy: 'influence' }) });
    [
      ['new-game-ai-edge-override', 'Override'],
      ['new-game-ai-edge-threshold', 'Threshold'],
      ['new-game-ai-edge-line-weight', 'Line Wt'],
      ['new-game-ai-edge-pick-n', 'Pick N'],
      ['new-game-ai-edge-pick-frac', 'Pick Frac'],
      ['new-game-ai-edge-endgame', 'Endgame'],
    ].forEach(([id, label]) => expectLabelPair(influenceHtml, id!, label!));

    const territoryHtml = renderModal({ ai: aiConfig({ opponent: 'white', strategy: 'territory' }) });
    expectLabelPair(territoryHtml, 'new-game-ai-edge-threshold', 'Threshold');
  });
});
