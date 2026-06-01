import type { BoardState, Move } from '../types';
import { getLiberties, getOpponent } from './gameLogic';

export type MoveInsightTone = 'corner' | 'side' | 'center' | 'pass' | 'tactical' | 'neutral';

export interface MoveInsight {
  label: string;
  detail: string;
  tone: MoveInsightTone;
  learnMoreUrl?: string;
}

export interface MoveInsightCoach {
  beginner: string;
  pro: string;
  checks: string[];
}

type EdgeName = 'left' | 'right' | 'top' | 'bottom' | 'center';
type Point = { x: number; y: number };

const CORNER_PATTERNS: Record<string, { label: string; detail: string; learnMoreUrl?: string }> = {
  '3-3': {
    label: '3-3 corner point',
    detail: 'Low corner point that secures territory; often appears as an invasion or solid enclosure point.',
    learnMoreUrl: 'https://senseis.xmp.net/?33Point',
  },
  '3-4': {
    label: '3-4 corner point',
    detail: 'Territory-leaning corner point with clear directional follow-ups.',
    learnMoreUrl: 'https://senseis.xmp.net/?34Point',
  },
  '3-5': {
    label: '3-5 corner point',
    detail: 'Asymmetric corner point that invites directional play and outside influence.',
  },
  '4-4': {
    label: '4-4 star point',
    detail: 'Balanced corner star point for fast development, influence, and flexible continuations.',
    learnMoreUrl: 'https://senseis.xmp.net/?44Point',
  },
  '4-5': {
    label: '4-5 high corner point',
    detail: 'High corner point that leans toward outside influence more than immediate territory.',
  },
  '5-5': {
    label: '5-5 high corner point',
    detail: 'Very high corner point; uncommon, influence-oriented, and often experimental.',
  },
};

function ordinal(line: number): string {
  if (line === 1) return '1st';
  if (line === 2) return '2nd';
  if (line === 3) return '3rd';
  return `${line}th`;
}

function getStarLines(boardSize: number): number[] {
  if (boardSize >= 15) {
    const center = Math.ceil(boardSize / 2);
    return [4, center, boardSize - 3];
  }
  if (boardSize >= 11) {
    const center = Math.ceil(boardSize / 2);
    return [4, center, boardSize - 3];
  }
  if (boardSize >= 7) {
    const center = Math.ceil(boardSize / 2);
    return [3, center, boardSize - 2];
  }
  return [Math.ceil(boardSize / 2)];
}

function nearestEdge(lowLine: number, highLine: number, lowEdge: EdgeName, highEdge: EdgeName): EdgeName {
  if (lowLine < highLine) return lowEdge;
  if (highLine < lowLine) return highEdge;
  return 'center';
}

function boardRegion(x: number, y: number, boardSize: number): string {
  const third = boardSize / 3;
  const horizontal = x < third ? 'left' : x >= boardSize - third ? 'right' : 'center';
  const vertical = y < third ? 'upper' : y >= boardSize - third ? 'lower' : 'center';

  if (horizontal === 'center' && vertical === 'center') return 'center';
  if (horizontal === 'center') return `${vertical} side`;
  if (vertical === 'center') return `${horizontal} side`;
  return `${vertical} ${horizontal}`;
}

function lineRole(line: number): string {
  if (line <= 1) return 'edge contact, usually very local and tactical';
  if (line === 2) return 'low, territory-focused play';
  if (line === 3) return 'territory-oriented play';
  if (line === 4) return 'balanced influence and territory';
  if (line === 5) return 'high, influence-oriented play';
  return 'center-oriented play';
}

function neighborsOf(x: number, y: number, boardSize: number): Point[] {
  return [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 },
  ].filter((point) => point.x >= 0 && point.x < boardSize && point.y >= 0 && point.y < boardSize);
}

function groupKey(group: Point[]): string {
  return group
    .map((point) => `${point.x},${point.y}`)
    .sort()
    .join('|');
}

function getEmptyTriangleInsight(move: Move, board: BoardState, boardSize: number): MoveInsight | null {
  const directions = [
    { x: 1, y: 1 },
    { x: 1, y: -1 },
    { x: -1, y: 1 },
    { x: -1, y: -1 },
  ];

  for (const direction of directions) {
    const horizontal = { x: move.x + direction.x, y: move.y };
    const vertical = { x: move.x, y: move.y + direction.y };
    const diagonal = { x: move.x + direction.x, y: move.y + direction.y };
    const points = [horizontal, vertical, diagonal];
    if (points.some((point) => point.x < 0 || point.y < 0 || point.x >= boardSize || point.y >= boardSize)) continue;
    if (
      board[horizontal.y]?.[horizontal.x] === move.player &&
      board[vertical.y]?.[vertical.x] === move.player &&
      board[diagonal.y]?.[diagonal.x] === null
    ) {
      return {
        label: 'Empty triangle',
        detail: 'Creates three stones in a bent 2x2 shape, usually an inefficient connection.',
        tone: 'tactical',
        learnMoreUrl: 'https://senseis.xmp.net/?EmptyTriangle',
      };
    }
  }

  return null;
}

function getTacticalMoveInsight(move: Move, boardSize: number, parentBoard?: BoardState | null): MoveInsight | null {
  if (!parentBoard || parentBoard.length !== boardSize) return null;
  if (move.x < 0 || move.y < 0 || move.x >= boardSize || move.y >= boardSize) return null;
  if (parentBoard[move.y]?.[move.x] !== null) return null;

  const opponent = getOpponent(move.player);
  const capturedGroups = new Map<string, number>();
  const atariGroups = new Set<string>();
  const friendlyGroups = new Set<string>();
  const neighbors = neighborsOf(move.x, move.y, boardSize);
  let friendlyNeighborCount = 0;

  for (const point of neighbors) {
    const stone = parentBoard[point.y]?.[point.x];
    if (!stone) continue;
    const { liberties, group } = getLiberties(parentBoard, point.x, point.y);
    const key = groupKey(group);
    if (stone === opponent) {
      if (liberties === 1) capturedGroups.set(key, group.length);
      else if (liberties === 2) atariGroups.add(key);
    } else if (stone === move.player) {
      friendlyNeighborCount += 1;
      friendlyGroups.add(key);
    }
  }

  if (capturedGroups.size > 0) {
    const capturedStones = [...capturedGroups.values()].reduce((sum, count) => sum + count, 0);
    return {
      label: 'Capture',
      detail: `Captures ${capturedStones} ${opponent} stone${capturedStones === 1 ? '' : 's'} by taking the last liberty.`,
      tone: 'tactical',
    };
  }

  if (atariGroups.size > 0) {
    return {
      label: 'Atari',
      detail: `Puts ${atariGroups.size === 1 ? 'an opponent group' : `${atariGroups.size} opponent groups`} down to one liberty.`,
      tone: 'tactical',
      learnMoreUrl: 'https://senseis.xmp.net/?Atari',
    };
  }

  const nextBoard = parentBoard.map((row) => [...row]);
  const nextRow = nextBoard[move.y];
  if (!nextRow) return null;
  nextRow[move.x] = move.player;
  const ownLiberties = getLiberties(nextBoard, move.x, move.y).liberties;
  if (ownLiberties === 0) {
    return {
      label: 'Suicide',
      detail: 'Places a stone with no liberties and no capture; most rulesets reject this move.',
      tone: 'tactical',
      learnMoreUrl: 'https://senseis.xmp.net/?Suicide',
    };
  }
  if (ownLiberties === 1) {
    return {
      label: 'Self-atari',
      detail: 'Leaves the played stone or connected group with only one liberty.',
      tone: 'tactical',
    };
  }

  if (neighbors.length > 0 && friendlyNeighborCount === neighbors.length) {
    return {
      label: 'Fill',
      detail: 'Fills a point fully surrounded by friendly stones; often an endgame, ko, or life-and-death move.',
      tone: 'tactical',
    };
  }

  const emptyTriangleInsight = getEmptyTriangleInsight(move, nextBoard, boardSize);
  if (emptyTriangleInsight) return emptyTriangleInsight;

  if (friendlyGroups.size >= 2) {
    return {
      label: 'Connect',
      detail: `Joins ${friendlyGroups.size} friendly groups into a stronger shape.`,
      tone: 'tactical',
    };
  }

  return null;
}

export function getMoveInsight(move: Move | null, boardSize: number, parentBoard?: BoardState | null): MoveInsight | null {
  if (!move) return null;
  if (move.x < 0 || move.y < 0) {
    return {
      label: 'Pass',
      detail: 'Passing hands the turn over without placing a stone.',
      tone: 'pass',
      learnMoreUrl: 'https://senseis.xmp.net/?Pass',
    };
  }
  if (boardSize <= 0 || move.x >= boardSize || move.y >= boardSize) return null;

  const tacticalInsight = getTacticalMoveInsight(move, boardSize, parentBoard);
  if (tacticalInsight) return tacticalInsight;

  const lineFromLeft = move.x + 1;
  const lineFromRight = boardSize - move.x;
  const lineFromTop = move.y + 1;
  const lineFromBottom = boardSize - move.y;
  const horizontalLine = Math.min(lineFromLeft, lineFromRight);
  const verticalLine = Math.min(lineFromTop, lineFromBottom);
  const sideLine = Math.min(horizontalLine, verticalLine);
  const region = boardRegion(move.x, move.y, boardSize);
  const centerLine = Math.ceil(boardSize / 2);

  if (lineFromLeft === centerLine && lineFromTop === centerLine) {
    return {
      label: boardSize >= 15 ? 'Tengen' : 'Center point',
      detail: 'Center point; globally influential but slow to claim secure territory.',
      tone: 'center',
      learnMoreUrl: boardSize >= 15 ? 'https://senseis.xmp.net/?Tengen' : undefined,
    };
  }

  if (horizontalLine <= 5 && verticalLine <= 5) {
    const low = Math.min(horizontalLine, verticalLine);
    const high = Math.max(horizontalLine, verticalLine);
    const key = `${low}-${high}`;
    const pattern = CORNER_PATTERNS[key] ?? {
      label: `${low}-${high} corner point`,
      detail: `${ordinal(low)}-${ordinal(high)} line corner move; read locally and check direction before committing.`,
    };
    return {
      label: pattern.label,
      detail: `${region} corner. ${pattern.detail}`,
      tone: 'corner',
      learnMoreUrl: pattern.learnMoreUrl,
    };
  }

  const starLines = getStarLines(boardSize);
  const isStarPoint = starLines.includes(lineFromLeft) && starLines.includes(lineFromTop);
  if (isStarPoint) {
    return {
      label: 'Side star point',
      detail: `${region} star point; often useful for frameworks, extensions, and influence.`,
      tone: 'side',
      learnMoreUrl: 'https://senseis.xmp.net/?StarPoint',
    };
  }

  if (sideLine <= 5) {
    const edge =
      horizontalLine <= verticalLine
        ? nearestEdge(lineFromLeft, lineFromRight, 'left', 'right')
        : nearestEdge(lineFromTop, lineFromBottom, 'top', 'bottom');
    const edgeText = edge === 'center' ? region : `${edge} side`;
    return {
      label: `${ordinal(sideLine)}-line side move`,
      detail: `${edgeText}; ${lineRole(sideLine)}.`,
      tone: 'side',
    };
  }

  return {
    label: 'Center-area move',
    detail: `${region}; ${lineRole(sideLine)}.`,
    tone: 'center',
  };
}

export function getMoveInsightCoach(insight: MoveInsight): MoveInsightCoach {
  if (insight.tone === 'pass') {
    return {
      beginner: 'Passing is usually right when both players have no valuable moves left.',
      pro: 'Check ko threats, dame, sente endgame, and whether passing changes life-and-death status.',
      checks: ['Endgame left?', 'Ko threats?', 'Life and death?'],
    };
  }

  if (insight.label === 'Capture') {
    return {
      beginner: 'Captures remove opponent stones and often settle an urgent local fight.',
      pro: 'Check whether the capture is sente, creates shortage of liberties, or leaves a snapback or ko.',
      checks: ['Sente', 'Snapback', 'Ko'],
    };
  }

  if (insight.label === 'Atari') {
    return {
      beginner: 'Atari gives an opponent group one liberty, so they usually need to answer.',
      pro: 'Confirm the atari is profitable; loose ataris can strengthen the opponent or lose sente.',
      checks: ['Escape route', 'Net', 'Sente'],
    };
  }

  if (insight.label === 'Self-atari') {
    return {
      beginner: 'Self-atari means your own stones have only one liberty, so they may be captured next.',
      pro: 'Read whether it works as a forcing sacrifice, ladder, snapback, or ko threat before trusting it.',
      checks: ['Liberties', 'Ladder', 'Snapback'],
    };
  }

  if (insight.label === 'Suicide') {
    return {
      beginner: 'Most games do not allow suicide moves because the played stone would have no liberties.',
      pro: 'If this came from an imported record, check the ruleset and whether the move should be rejected.',
      checks: ['Ruleset', 'Import', 'Legality'],
    };
  }

  if (insight.label === 'Empty triangle') {
    return {
      beginner: 'An empty triangle connects stones, but it is often slow and heavy.',
      pro: 'Check whether a bamboo joint, tiger mouth, diagonal move, or forcing exchange keeps the same connection more efficiently.',
      checks: ['Efficiency', 'Cut point', 'Alternative'],
    };
  }

  if (insight.label === 'Connect') {
    return {
      beginner: 'Connecting stones makes them harder to cut and easier to keep alive.',
      pro: 'Compare the solid connection with forcing moves, tiger mouths, and counter-cuts.',
      checks: ['Cuts', 'Shape', 'Aji'],
    };
  }

  if (insight.label === 'Fill') {
    return {
      beginner: 'Filling your own surrounded point can be right, but it often spends a move inside your shape.',
      pro: 'Check whether the point affects life, ko, seki, dame, or final scoring before playing it.',
      checks: ['Eye shape', 'Seki', 'Endgame'],
    };
  }

  if (insight.tone === 'center') {
    return {
      beginner: 'Center moves build influence, but they need nearby stones or weak groups to matter.',
      pro: 'Look for targets, sector lines, and whether the move turns outside strength into profit.',
      checks: ['Targets', 'Direction', 'Follow-up'],
    };
  }

  if (insight.tone === 'side') {
    const lowSide = insight.label.includes('2nd-line') || insight.label.includes('3rd-line');
    return {
      beginner: lowSide
        ? 'Low side moves are about territory and stability along the edge.'
        : 'High side moves are about influence, pressure, and building a framework.',
      pro: 'Check extension distance, nearby thickness, cut points, and whether the side move is sente.',
      checks: ['Extension', 'Cuts', 'Sente'],
    };
  }

  if (insight.label.includes('3-3')) {
    return {
      beginner: 'The 3-3 point secures corner territory quickly, often giving the opponent outside influence.',
      pro: 'Before invading, count outside strength and confirm the opponent cannot profit twice.',
      checks: ['Corner secure', 'Outside influence', 'Sente'],
    };
  }

  if (insight.label.includes('4-4')) {
    return {
      beginner: 'The 4-4 point develops quickly and keeps many follow-ups open.',
      pro: 'Choose approach direction by checking ladders, pincers, and which side is more important.',
      checks: ['Approach side', 'Pincer', 'Ladders'],
    };
  }

  if (insight.label.includes('3-4')) {
    return {
      beginner: 'The 3-4 point leans toward territory and has a clear direction for enclosure or extension.',
      pro: 'Read approach pressure, shimari value, and whether the outside direction fits the board.',
      checks: ['Shimari', 'Approach', 'Direction'],
    };
  }

  return {
    beginner: 'Corner moves trade territory, influence, and speed. Start by asking what this corner wants.',
    pro: 'Check local joseki direction, outside strength, ladders, and who keeps sente after the exchange.',
    checks: ['Joseki aim', 'Outside strength', 'Sente'],
  };
}
