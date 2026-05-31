import type { Move } from '../types';

export type MoveInsightTone = 'corner' | 'side' | 'center' | 'pass' | 'neutral';

export interface MoveInsight {
  label: string;
  detail: string;
  tone: MoveInsightTone;
}

type EdgeName = 'left' | 'right' | 'top' | 'bottom' | 'center';

const CORNER_PATTERNS: Record<string, { label: string; detail: string }> = {
  '3-3': {
    label: '3-3 corner point',
    detail: 'Low corner point that secures territory; often appears as an invasion or solid enclosure point.',
  },
  '3-4': {
    label: '3-4 corner point',
    detail: 'Territory-leaning corner point with clear directional follow-ups.',
  },
  '3-5': {
    label: '3-5 corner point',
    detail: 'Asymmetric corner point that invites directional play and outside influence.',
  },
  '4-4': {
    label: '4-4 star point',
    detail: 'Balanced corner star point for fast development, influence, and flexible continuations.',
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

export function getMoveInsight(move: Move | null, boardSize: number): MoveInsight | null {
  if (!move) return null;
  if (move.x < 0 || move.y < 0) {
    return {
      label: 'Pass',
      detail: 'Passing hands the turn over without placing a stone.',
      tone: 'pass',
    };
  }
  if (boardSize <= 0 || move.x >= boardSize || move.y >= boardSize) return null;

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
    };
  }

  const starLines = getStarLines(boardSize);
  const isStarPoint = starLines.includes(lineFromLeft) && starLines.includes(lineFromTop);
  if (isStarPoint) {
    return {
      label: 'Side star point',
      detail: `${region} star point; often useful for frameworks, extensions, and influence.`,
      tone: 'side',
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
