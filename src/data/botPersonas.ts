import type { GameSettings } from '../types';

export interface BotPersonaTraits {
  reading: number; // 0-100
  fighting: number;
  territory: number;
  risk: number;
}

export interface BotPersona {
  id: string;
  name: string;
  strategy: GameSettings['aiStrategy'];
  styleTags: string[];
  blurb: string;
  traits: BotPersonaTraits;
  rankKyu: number; // KaTrain kyu scale: positive = kyu, <=0 = dan (0 => 1d, -1 => 2d ...)
  overrides?: Partial<GameSettings>;
}

// Named characters over the existing engine strategies. Only the 'rank' strategy
// has real kyu calibration; ranks on other personas are hand-tuned approximations,
// and the trait bars are descriptive rather than measured.
export const BOT_PERSONAS: BotPersona[] = [
  {
    id: 'pebble',
    name: 'Pebble',
    strategy: 'rank',
    styleTags: ['Gentle', 'Balanced'],
    blurb: 'A patient beginner. Plays honest, simple shapes and rarely starts a fight.',
    traits: { reading: 20, fighting: 20, territory: 45, risk: 20 },
    rankKyu: 15,
    overrides: { aiRankKyu: 15 },
  },
  {
    id: 'reed',
    name: 'Reed',
    strategy: 'rank',
    styleTags: ['Calm', 'Balanced'],
    blurb: 'Solid single-digit kyu. Punishes overplays but seldom overreaches.',
    traits: { reading: 45, fighting: 40, territory: 55, risk: 35 },
    rankKyu: 7,
    overrides: { aiRankKyu: 7 },
  },
  {
    id: 'onyx',
    name: 'Onyx',
    strategy: 'rank',
    styleTags: ['Sharp', 'Dan'],
    blurb: 'A dan-level all-rounder. Reads deeply and closes games cleanly.',
    traits: { reading: 80, fighting: 70, territory: 70, risk: 45 },
    rankKyu: 0,
    overrides: { aiRankKyu: 0 },
  },
  {
    id: 'tengen',
    name: 'Tengen',
    strategy: 'default',
    styleTags: ['Modern', 'Relentless'],
    blurb: 'No handicap to its reading — the engine\'s top move, every time.',
    traits: { reading: 100, fighting: 90, territory: 85, risk: 55 },
    rankKyu: -8,
  },
  {
    id: 'anchor',
    name: 'Anchor',
    strategy: 'territory',
    styleTags: ['Territorial', 'Grounded'],
    blurb: 'Takes cash on the third line and dares you to build a wall you can\'t use.',
    traits: { reading: 60, fighting: 40, territory: 95, risk: 30 },
    rankKyu: -2,
  },
  {
    id: 'cascade',
    name: 'Cascade',
    strategy: 'influence',
    styleTags: ['Cosmic', 'Moyo'],
    blurb: 'Builds sweeping frameworks and invites you to invade — then attacks.',
    traits: { reading: 65, fighting: 70, territory: 40, risk: 70 },
    rankKyu: -2,
  },
  {
    id: 'ember',
    name: 'Ember',
    strategy: 'scoreloss',
    styleTags: ['Aggressive', 'Loose'],
    blurb: 'Loves a brawl. Strong ideas, but will hand back points when it gets greedy.',
    traits: { reading: 55, fighting: 85, territory: 45, risk: 90 },
    rankKyu: 3,
  },
  {
    id: 'willow',
    name: 'Willow',
    strategy: 'settle',
    styleTags: ['Steady', 'Thick'],
    blurb: 'Settles every group completely before reaching for more. Hard to attack.',
    traits: { reading: 60, fighting: 35, territory: 70, risk: 20 },
    rankKyu: -1,
  },
  {
    id: 'magpie',
    name: 'Magpie',
    strategy: 'local',
    styleTags: ['Fighter', 'Focused'],
    blurb: 'Answers where you play. Great in a close-quarters fight, blind to the whole board.',
    traits: { reading: 55, fighting: 80, territory: 45, risk: 60 },
    rankKyu: 2,
  },
  {
    id: 'wanderer',
    name: 'Wanderer',
    strategy: 'tenuki',
    styleTags: ['Restless', 'Unpredictable'],
    blurb: 'Rarely finishes a joseki — it\'s already off playing the biggest point elsewhere.',
    traits: { reading: 50, fighting: 55, territory: 55, risk: 75 },
    rankKyu: 3,
  },
];

/**
 * The AI-config patch a persona applies. All persona params live on GameSettings,
 * so this plugs straight into NewGameModal's updateAiConfig -> onStart -> updateSettings.
 */
export function botPersonaAiPatch(persona: BotPersona): Partial<GameSettings> {
  return {
    aiStrategy: persona.strategy,
    aiRankKyu: persona.rankKyu,
    ...persona.overrides,
  };
}

export function findBotPersona(id: string | null | undefined): BotPersona | undefined {
  if (!id) return undefined;
  return BOT_PERSONAS.find((persona) => persona.id === id);
}
