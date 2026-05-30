import type { GameNode, GameRules } from '../types';

const rulesLabelBySetting: Record<GameRules, string> = {
  japanese: 'Japanese',
  chinese: 'Chinese',
  korean: 'Korean',
};

const formatInfoKomi = (komi: number): string =>
  Number.isInteger(komi) ? String(komi) : String(Number(komi.toFixed(2)));

export function formatRootInfoText(opts: {
  rootNode: Pick<GameNode, 'properties'>;
  currentNode: Pick<GameNode, 'gameState' | 'properties'>;
  gameRules: GameRules;
}): string {
  const rulesRaw = opts.rootNode.properties?.RU?.[0] ?? opts.currentNode.properties?.RU?.[0];
  const rules = typeof rulesRaw === 'string' && rulesRaw.trim() ? rulesRaw.trim() : rulesLabelBySetting[opts.gameRules];
  return `Komi: ${formatInfoKomi(opts.currentNode.gameState.komi)}\nRuleset: ${rules}\n`;
}
