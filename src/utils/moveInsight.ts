import type { BoardState, Move } from '../types';
import {
  CONTACT_MOVE_PATTERNS,
  FUSEKI_PATTERNS,
  NAMED_SHAPE_PATTERNS,
} from '../data/boardPatternLibrary';
import { findBoardPattern, type BoardPattern } from './boardPatterns';
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
type RelativeShape = { stones: Point[]; empties: Point[] };
type CornerTransform = { xEdge: 'left' | 'right'; yEdge: 'top' | 'bottom' };
type CornerRelationPattern = {
  label: 'Low approach' | 'High approach' | 'Low enclosure' | 'High enclosure';
  detail: string;
  learnMoreUrl: string;
  anchor: Point;
  move: Point;
  anchorColor: 'friendly' | 'opponent';
  localMax: Point;
};

const LIBRARY_PATTERN_DETAILS: Record<string, { detail: string; tone: MoveInsightTone }> = {
  'Low Chinese Opening': {
    detail: 'Whole-board formation: the low Chinese builds a wide framework that invites invasions on your terms.',
    tone: 'corner',
  },
  'High Chinese Opening': {
    detail: 'Whole-board formation: the high Chinese emphasizes influence and attacks over immediate territory.',
    tone: 'corner',
  },
  'Orthodox Opening': {
    detail: 'Whole-board formation balancing a corner enclosure with a wide side extension.',
    tone: 'corner',
  },
  'Enclosure Opening': {
    detail: 'Whole-board formation built around an early corner enclosure and steady development.',
    tone: 'corner',
  },
  'Kobayashi Opening': {
    detail: 'Whole-board formation that invites an approach, planning to attack it for profit.',
    tone: 'corner',
  },
  'Small Chinese Opening': {
    detail: 'Whole-board formation: a tighter Chinese-style framework with sharper follow-ups.',
    tone: 'corner',
  },
  'Micro Chinese Opening': {
    detail: 'Whole-board formation: the narrowest Chinese-style framework, favoring fighting continuations.',
    tone: 'corner',
  },
  'Sanrensei Opening': {
    detail: 'Whole-board formation: three star points in a row aiming at a large influence-based framework.',
    tone: 'corner',
  },
  'Nirensei Opening': {
    detail: 'Whole-board formation: two star points on one side for fast, flexible development.',
    tone: 'corner',
  },
  'Shūsaku Opening': {
    detail: 'Whole-board formation: the classical diagonal opening prizing solid, patient development.',
    tone: 'corner',
  },
  '3-3 Point Invasion': {
    detail: 'Invades beneath the 4-4 stone, trading outside influence for immediate corner territory.',
    tone: 'tactical',
  },
  'Mouth Shape': {
    detail: 'Completes the mouth shape: a strong, flexible formation with excellent eye potential.',
    tone: 'tactical',
  },
  'Table Shape': {
    detail: 'Completes the table shape: a solid formation balancing connection, eyes, and outward reach.',
    tone: 'tactical',
  },
  'Tippy Table': {
    detail: 'Completes a tippy table: a lighter cousin of the table shape, fast but thinner.',
    tone: 'tactical',
  },
  Trapezium: {
    detail: 'Completes a trapezium: a sturdy four-stone formation often arising from contact fights.',
    tone: 'tactical',
  },
  Diamond: {
    detail: 'Completes a diamond: four stones around a shared point — extremely thick, but slow.',
    tone: 'tactical',
  },
  Square: {
    detail: 'Completes a square formation: loosely linked stones enclosing a shared area.',
    tone: 'tactical',
  },
  'Throwing Star': {
    detail: 'Completes a pinwheel of stones around a shared point, common in crosscut fighting.',
    tone: 'tactical',
  },
  Parallelogram: {
    detail: 'Completes a parallelogram: a slanted four-stone formation mixing speed with connection.',
    tone: 'tactical',
  },
  'Dog’s Head': {
    detail: 'Completes the dog’s head (sake bottle): a classic good-shape formation from contact play.',
    tone: 'tactical',
  },
  'Horse’s Head': {
    detail: 'Completes the horse’s head: a wider good-shape formation reaching toward the center.',
    tone: 'tactical',
  },
  'Big Bulge': {
    detail: 'Completes the big bulge: three stones curving around a key point with strong follow-ups.',
    tone: 'tactical',
  },
  Turn: {
    detail: 'Turns around the opponent’s stone while staying connected — usually thick and forcing.',
    tone: 'tactical',
  },
  Stretch: {
    detail: 'Extends solidly from a friendly stone; unhurried, but leaves no weakness behind.',
    tone: 'tactical',
  },
};

const FUSEKI_PATTERN_NAMES = new Set(FUSEKI_PATTERNS.map((pattern) => pattern.name));
const SHAPE_PATTERN_NAMES = new Set(
  [...NAMED_SHAPE_PATTERNS, ...CONTACT_MOVE_PATTERNS].map((pattern) => pattern.name)
);

function getLibraryPatternInsight(
  move: Move,
  parentBoard: BoardState,
  patterns: BoardPattern[]
): MoveInsight | null {
  const match = findBoardPattern(move, parentBoard, patterns);
  if (!match) return null;
  const info = LIBRARY_PATTERN_DETAILS[match.pattern.name];
  return {
    label: match.pattern.name,
    detail: info?.detail ?? 'Named Go pattern.',
    tone: info?.tone ?? 'tactical',
    learnMoreUrl: match.pattern.url ?? undefined,
  };
}

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

const CORNER_TRANSFORMS: CornerTransform[] = [
  { xEdge: 'left', yEdge: 'top' },
  { xEdge: 'right', yEdge: 'top' },
  { xEdge: 'left', yEdge: 'bottom' },
  { xEdge: 'right', yEdge: 'bottom' },
];

const CORNER_RELATION_PATTERNS: CornerRelationPattern[] = [
  {
    label: 'Low approach',
    detail: 'Approaches an opposing 3-4 corner stone from the low side, asking how the corner should answer.',
    learnMoreUrl: 'https://senseis.xmp.net/?34PointLowApproach',
    anchor: { x: 2, y: 3 },
    move: { x: 4, y: 2 },
    anchorColor: 'opponent',
    localMax: { x: 5, y: 4 },
  },
  {
    label: 'High approach',
    detail: 'Approaches an opposing 3-4 corner stone on the 4th line, leaning toward influence and outside pressure.',
    learnMoreUrl: 'https://senseis.xmp.net/?34PointHighApproach',
    anchor: { x: 2, y: 3 },
    move: { x: 4, y: 3 },
    anchorColor: 'opponent',
    localMax: { x: 5, y: 4 },
  },
  {
    label: 'Low approach',
    detail: 'Approaches an opposing 4-4 stone from the low side, aiming to reduce the corner while staying settled.',
    learnMoreUrl: 'https://senseis.xmp.net/?44PointLowApproach',
    anchor: { x: 3, y: 3 },
    move: { x: 5, y: 2 },
    anchorColor: 'opponent',
    localMax: { x: 6, y: 4 },
  },
  {
    label: 'High approach',
    detail: 'Approaches an opposing 4-4 stone from the high side, emphasizing outside influence and attack direction.',
    learnMoreUrl: 'https://senseis.xmp.net/?44PointHighApproach',
    anchor: { x: 3, y: 3 },
    move: { x: 5, y: 3 },
    anchorColor: 'opponent',
    localMax: { x: 6, y: 4 },
  },
  {
    label: 'Low enclosure',
    detail: 'Makes a low shimari with a friendly 3-4 stone, securing corner territory and a stable base.',
    learnMoreUrl: 'https://senseis.xmp.net/?3453Enclosure',
    anchor: { x: 2, y: 3 },
    move: { x: 4, y: 2 },
    anchorColor: 'friendly',
    localMax: { x: 5, y: 4 },
  },
  {
    label: 'High enclosure',
    detail: 'Makes a high shimari with a friendly 3-4 stone, trading some territory for outside influence.',
    learnMoreUrl: 'https://senseis.xmp.net/?3454Enclosure',
    anchor: { x: 2, y: 3 },
    move: { x: 4, y: 3 },
    anchorColor: 'friendly',
    localMax: { x: 5, y: 4 },
  },
  {
    label: 'Low enclosure',
    detail: 'Makes a low enclosure with a friendly 4-4 stone, stabilizing the corner while keeping extension options.',
    learnMoreUrl: 'https://senseis.xmp.net/?4463Enclosure',
    anchor: { x: 3, y: 3 },
    move: { x: 5, y: 2 },
    anchorColor: 'friendly',
    localMax: { x: 6, y: 4 },
  },
  {
    label: 'High enclosure',
    detail: 'Makes a high enclosure with a friendly 4-4 stone, building a wider outside-facing corner shape.',
    learnMoreUrl: 'https://senseis.xmp.net/?4464Enclosure',
    anchor: { x: 3, y: 3 },
    move: { x: 5, y: 3 },
    anchorColor: 'friendly',
    localMax: { x: 6, y: 4 },
  },
];

function swapPoint(point: Point): Point {
  return { x: point.y, y: point.x };
}

function cornerPointToBoard(point: Point, transform: CornerTransform, boardSize: number): Point {
  return {
    x: transform.xEdge === 'left' ? point.x : boardSize - 1 - point.x,
    y: transform.yEdge === 'top' ? point.y : boardSize - 1 - point.y,
  };
}

function boardPointToCorner(point: Point, transform: CornerTransform, boardSize: number): Point {
  return {
    x: transform.xEdge === 'left' ? point.x : boardSize - 1 - point.x,
    y: transform.yEdge === 'top' ? point.y : boardSize - 1 - point.y,
  };
}

function cornerLocalAreaIsEmpty(
  board: BoardState,
  boardSize: number,
  transform: CornerTransform,
  localMax: Point,
  exceptions: readonly string[]
): boolean {
  const exceptionSet = new Set(exceptions);
  for (let y = 0; y <= localMax.y; y += 1) {
    for (let x = 0; x <= localMax.x; x += 1) {
      const local = { x, y };
      const actual = cornerPointToBoard(local, transform, boardSize);
      if (actual.x < 0 || actual.y < 0 || actual.x >= boardSize || actual.y >= boardSize) return false;
      if (exceptionSet.has(`${local.x},${local.y}`)) continue;
      if (board[actual.y]?.[actual.x] !== null) return false;
    }
  }
  return true;
}

function getCornerRelationInsight(move: Move, board: BoardState, boardSize: number): MoveInsight | null {
  if (boardSize < 13) return null;
  const opponent = getOpponent(move.player);

  for (const transform of CORNER_TRANSFORMS) {
    const localMove = boardPointToCorner(move, transform, boardSize);
    for (const pattern of CORNER_RELATION_PATTERNS) {
      const variants = [
        { anchor: pattern.anchor, move: pattern.move, localMax: pattern.localMax },
        { anchor: swapPoint(pattern.anchor), move: swapPoint(pattern.move), localMax: swapPoint(pattern.localMax) },
      ];
      for (const variant of variants) {
        if (localMove.x !== variant.move.x || localMove.y !== variant.move.y) continue;
        const anchor = cornerPointToBoard(variant.anchor, transform, boardSize);
        if (anchor.x < 0 || anchor.y < 0 || anchor.x >= boardSize || anchor.y >= boardSize) continue;
        const expectedAnchor = pattern.anchorColor === 'friendly' ? move.player : opponent;
        if (board[anchor.y]?.[anchor.x] !== expectedAnchor) continue;
        if (
          !cornerLocalAreaIsEmpty(board, boardSize, transform, variant.localMax, [
            `${variant.anchor.x},${variant.anchor.y}`,
            `${variant.move.x},${variant.move.y}`,
          ])
        ) {
          continue;
        }

        return {
          label: pattern.label,
          detail: pattern.detail,
          tone: 'corner',
          learnMoreUrl: pattern.learnMoreUrl,
        };
      }
    }
  }

  return null;
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

function getCutOrDiagonalInsight(move: Move, board: BoardState, boardSize: number): MoveInsight | null {
  const opponent = getOpponent(move.player);
  const directions = [
    { x: 1, y: 1 },
    { x: 1, y: -1 },
    { x: -1, y: 1 },
    { x: -1, y: -1 },
  ];

  for (const direction of directions) {
    const diagonal = { x: move.x + direction.x, y: move.y + direction.y };
    const sideA = { x: move.x + direction.x, y: move.y };
    const sideB = { x: move.x, y: move.y + direction.y };
    const points = [diagonal, sideA, sideB];
    if (points.some((point) => point.x < 0 || point.y < 0 || point.x >= boardSize || point.y >= boardSize)) continue;
    if (board[diagonal.y]?.[diagonal.x] !== move.player) continue;

    const sideAStone = board[sideA.y]?.[sideA.x];
    const sideBStone = board[sideB.y]?.[sideB.x];
    if (sideAStone === opponent && sideBStone === opponent) {
      return {
        label: 'Cut',
        detail: 'Separates opposing stones by occupying the cutting shape between them.',
        tone: 'tactical',
        learnMoreUrl: 'https://senseis.xmp.net/?Cut',
      };
    }

    if (
      (sideAStone === opponent && sideBStone === null) ||
      (sideBStone === opponent && sideAStone === null)
    ) {
      return {
        label: 'Hane',
        detail: 'Bends around an opposing stone from a diagonal friendly stone.',
        tone: 'tactical',
        learnMoreUrl: 'https://senseis.xmp.net/?Hane',
      };
    }

    if (sideAStone === null && sideBStone === null) {
      return {
        label: 'Diagonal (kosumi)',
        detail: 'Makes a light diagonal connection with flexible follow-ups.',
        tone: 'tactical',
        learnMoreUrl: 'https://senseis.xmp.net/?Kosumi',
      };
    }
  }

  return null;
}

function getWedgeInsight(move: Move, board: BoardState, boardSize: number): MoveInsight | null {
  const opponent = getOpponent(move.player);
  const axes = [
    {
      ends: [
        { x: -1, y: 0 },
        { x: 1, y: 0 },
      ],
      sides: [
        { x: 0, y: -1 },
        { x: 0, y: 1 },
      ],
    },
    {
      ends: [
        { x: 0, y: -1 },
        { x: 0, y: 1 },
      ],
      sides: [
        { x: -1, y: 0 },
        { x: 1, y: 0 },
      ],
    },
  ];

  for (const axis of axes) {
    const ends = axis.ends.map((point) => ({ x: move.x + point.x, y: move.y + point.y }));
    const sides = axis.sides.map((point) => ({ x: move.x + point.x, y: move.y + point.y }));
    const points = [...ends, ...sides];
    if (points.some((point) => point.x < 0 || point.y < 0 || point.x >= boardSize || point.y >= boardSize)) continue;
    if (
      ends.every((point) => board[point.y]?.[point.x] === opponent) &&
      sides.every((point) => board[point.y]?.[point.x] === null)
    ) {
      return {
        label: 'Wedge',
        detail: 'Plays between two opposing stones to separate or pressure both sides.',
        tone: 'tactical',
        learnMoreUrl: 'https://senseis.xmp.net/?Wedge',
      };
    }
  }

  return null;
}

function getShoulderHitInsight(move: Move, board: BoardState, boardSize: number): MoveInsight | null {
  const opponent = getOpponent(move.player);
  const directions = [
    { x: 1, y: 1 },
    { x: 1, y: -1 },
    { x: -1, y: 1 },
    { x: -1, y: -1 },
  ];

  for (const direction of directions) {
    const shoulderStone = { x: move.x + direction.x, y: move.y + direction.y };
    const surroundingPoints: Point[] = [];

    for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
      for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
        if (xOffset === 0 && yOffset === 0) continue;
        if (xOffset === direction.x && yOffset === direction.y) continue;
        surroundingPoints.push({ x: move.x + xOffset, y: move.y + yOffset });
      }
    }

    const points = [shoulderStone, ...surroundingPoints];
    if (points.some((point) => point.x < 0 || point.y < 0 || point.x >= boardSize || point.y >= boardSize)) continue;
    if (
      board[shoulderStone.y]?.[shoulderStone.x] === opponent &&
      surroundingPoints.every((point) => board[point.y]?.[point.x] === null)
    ) {
      return {
        label: 'Shoulder hit',
        detail: 'Leans diagonally against an opposing stone to reduce its area while staying light.',
        tone: 'tactical',
        learnMoreUrl: 'https://senseis.xmp.net/?ShoulderHit',
      };
    }
  }

  return null;
}

function getAttachmentInsight(move: Move, board: BoardState, boardSize: number): MoveInsight | null {
  const opponent = getOpponent(move.player);
  const directions = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  for (const direction of directions) {
    const attachedStone = { x: move.x + direction.x, y: move.y + direction.y };
    const sideOffsets =
      direction.x !== 0
        ? [
            { x: 0, y: -1 },
            { x: direction.x, y: -1 },
            { x: 0, y: 1 },
            { x: direction.x, y: 1 },
          ]
        : [
            { x: -1, y: 0 },
            { x: -1, y: direction.y },
            { x: 1, y: 0 },
            { x: 1, y: direction.y },
          ];
    const sidePoints = sideOffsets.map((offset) => ({ x: move.x + offset.x, y: move.y + offset.y }));
    const points = [attachedStone, ...sidePoints];
    if (points.some((point) => point.x < 0 || point.y < 0 || point.x >= boardSize || point.y >= boardSize)) continue;
    if (
      board[attachedStone.y]?.[attachedStone.x] === opponent &&
      sidePoints.every((point) => board[point.y]?.[point.x] === null)
    ) {
      return {
        label: 'Attachment',
        detail: 'Touches an opposing stone directly, usually asking for an immediate local response.',
        tone: 'tactical',
        learnMoreUrl: 'https://senseis.xmp.net/?Attachment',
      };
    }
  }

  return null;
}

function getBambooJointInsight(move: Move, board: BoardState, boardSize: number): MoveInsight | null {
  const shapes: RelativeShape[] = [
    {
      stones: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 2 },
        { x: 1, y: 2 },
      ],
      empties: [
        { x: 0, y: 1 },
        { x: 1, y: 1 },
      ],
    },
    {
      stones: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 0, y: 1 },
        { x: 2, y: 1 },
      ],
      empties: [
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
    },
  ];

  for (const shape of shapes) {
    for (const moveOffset of shape.stones) {
      const origin = { x: move.x - moveOffset.x, y: move.y - moveOffset.y };
      const stones = shape.stones.map((point) => ({ x: origin.x + point.x, y: origin.y + point.y }));
      const empties = shape.empties.map((point) => ({ x: origin.x + point.x, y: origin.y + point.y }));
      const allPoints = [...stones, ...empties];
      if (allPoints.some((point) => point.x < 0 || point.y < 0 || point.x >= boardSize || point.y >= boardSize)) continue;
      if (
        stones.every((point) => board[point.y]?.[point.x] === move.player) &&
        empties.every((point) => board[point.y]?.[point.x] === null)
      ) {
        return {
          label: 'Bamboo joint',
          detail: 'Completes a flexible four-stone connection that is hard to cut cleanly.',
          tone: 'tactical',
          learnMoreUrl: 'https://senseis.xmp.net/?BambooJoint',
        };
      }
    }
  }

  return null;
}

function getTigersMouthInsight(move: Move, board: BoardState, boardSize: number): MoveInsight | null {
  const directions = [
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: -1, y: 0 },
  ];

  for (const direction of directions) {
    const perpendicular = { x: -direction.y, y: direction.x };
    const stoneOffsets = [
      perpendicular,
      { x: -perpendicular.x, y: -perpendicular.y },
      direction,
    ];
    for (const moveOffset of stoneOffsets) {
      const center = { x: move.x - moveOffset.x, y: move.y - moveOffset.y };
      const sideA = { x: center.x + perpendicular.x, y: center.y + perpendicular.y };
      const sideB = { x: center.x - perpendicular.x, y: center.y - perpendicular.y };
      const back = { x: center.x + direction.x, y: center.y + direction.y };
      const front = { x: center.x - direction.x, y: center.y - direction.y };
      const points = [center, sideA, sideB, back, front];
      if (points.some((point) => point.x < 0 || point.y < 0 || point.x >= boardSize || point.y >= boardSize)) continue;
      if (
        board[sideA.y]?.[sideA.x] === move.player &&
        board[sideB.y]?.[sideB.x] === move.player &&
        board[back.y]?.[back.x] === move.player &&
        board[center.y]?.[center.x] === null &&
        board[front.y]?.[front.x] === null
      ) {
        return {
          label: "Tiger's mouth",
          detail: 'Forms a light connection around a shared cutting point.',
          tone: 'tactical',
          learnMoreUrl: 'https://senseis.xmp.net/?TigersMouth',
        };
      }
    }
  }

  return null;
}

function getJumpShapeInsight(move: Move, board: BoardState, boardSize: number): MoveInsight | null {
  const isOnBoard = (point: Point): boolean => point.x >= 0 && point.y >= 0 && point.x < boardSize && point.y < boardSize;
  const hasFriendlyStoneWithEmptyPath = (stone: Point, empties: Point[]): boolean => {
    const points = [stone, ...empties];
    return (
      points.every(isOnBoard) &&
      board[stone.y]?.[stone.x] === move.player &&
      empties.every((point) => board[point.y]?.[point.x] === null)
    );
  };

  const cardinalDirections = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  for (const direction of cardinalDirections) {
    const onePointStone = { x: move.x + direction.x * 2, y: move.y + direction.y * 2 };
    const onePointGap = { x: move.x + direction.x, y: move.y + direction.y };
    if (hasFriendlyStoneWithEmptyPath(onePointStone, [onePointGap])) {
      return {
        label: 'One-point jump',
        detail: 'Extends from a friendly stone with one empty point between, making a fast but peepable connection.',
        tone: 'tactical',
        learnMoreUrl: 'https://senseis.xmp.net/?OnePointJump',
      };
    }

    const twoPointStone = { x: move.x + direction.x * 3, y: move.y + direction.y * 3 };
    const twoPointGaps = [
      { x: move.x + direction.x, y: move.y + direction.y },
      { x: move.x + direction.x * 2, y: move.y + direction.y * 2 },
    ];
    if (hasFriendlyStoneWithEmptyPath(twoPointStone, twoPointGaps)) {
      return {
        label: 'Two-point jump',
        detail: 'Extends quickly with two empty points between friendly stones; efficient but easier to invade or cut.',
        tone: 'tactical',
        learnMoreUrl: 'https://senseis.xmp.net/?TwoPointJump',
      };
    }
  }

  const smallKnightOffsets = [
    { x: 2, y: 1 },
    { x: 2, y: -1 },
    { x: -2, y: 1 },
    { x: -2, y: -1 },
    { x: 1, y: 2 },
    { x: 1, y: -2 },
    { x: -1, y: 2 },
    { x: -1, y: -2 },
  ];

  for (const offset of smallKnightOffsets) {
    const stone = { x: move.x + offset.x, y: move.y + offset.y };
    const stepX = Math.sign(offset.x);
    const stepY = Math.sign(offset.y);
    const empties =
      Math.abs(offset.x) > Math.abs(offset.y)
        ? [
            { x: move.x + stepX, y: move.y },
            { x: move.x + stepX, y: move.y + stepY },
          ]
        : [
            { x: move.x, y: move.y + stepY },
            { x: move.x + stepX, y: move.y + stepY },
          ];
    if (hasFriendlyStoneWithEmptyPath(stone, empties)) {
      return {
        label: 'Small knight',
        detail: 'Makes a keima connection: fast and flexible, but with a known cutting point.',
        tone: 'tactical',
        learnMoreUrl: 'https://senseis.xmp.net/?Keima',
      };
    }
  }

  const largeKnightOffsets = [
    { x: 3, y: 1 },
    { x: 3, y: -1 },
    { x: -3, y: 1 },
    { x: -3, y: -1 },
    { x: 1, y: 3 },
    { x: 1, y: -3 },
    { x: -1, y: 3 },
    { x: -1, y: -3 },
  ];

  for (const offset of largeKnightOffsets) {
    const stone = { x: move.x + offset.x, y: move.y + offset.y };
    const stepX = Math.sign(offset.x);
    const stepY = Math.sign(offset.y);
    const empties =
      Math.abs(offset.x) > Math.abs(offset.y)
        ? [
            { x: move.x + stepX, y: move.y },
            { x: move.x + stepX * 2, y: move.y },
            { x: move.x + stepX, y: move.y + stepY },
            { x: move.x + stepX * 2, y: move.y + stepY },
          ]
        : [
            { x: move.x, y: move.y + stepY },
            { x: move.x, y: move.y + stepY * 2 },
            { x: move.x + stepX, y: move.y + stepY },
            { x: move.x + stepX, y: move.y + stepY * 2 },
          ];
    if (hasFriendlyStoneWithEmptyPath(stone, empties)) {
      return {
        label: 'Large knight',
        detail: 'Makes a wide knight move that is fast for development but leaves more cutting aji.',
        tone: 'tactical',
        learnMoreUrl: 'https://senseis.xmp.net/?LargeKnightsMove',
      };
    }
  }

  const diagonalDirections = [
    { x: 1, y: 1 },
    { x: 1, y: -1 },
    { x: -1, y: 1 },
    { x: -1, y: -1 },
  ];

  for (const direction of diagonalDirections) {
    const stone = { x: move.x + direction.x * 2, y: move.y + direction.y * 2 };
    const empties = [
      { x: move.x + direction.x, y: move.y },
      { x: move.x, y: move.y + direction.y },
      { x: move.x + direction.x, y: move.y + direction.y },
      { x: move.x + direction.x * 2, y: move.y + direction.y },
      { x: move.x + direction.x, y: move.y + direction.y * 2 },
    ];
    if (hasFriendlyStoneWithEmptyPath(stone, empties)) {
      return {
        label: 'Diagonal jump',
        detail: 'Links two friendly stones diagonally at a distance, keeping speed while leaving several forcing points.',
        tone: 'tactical',
        learnMoreUrl: 'https://senseis.xmp.net/?DiagonalJump',
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

  // Multi-stone named shapes (table shape, dog's head, ...) are more specific
  // than the two- and three-stone relations checked below.
  const namedShapeInsight = getLibraryPatternInsight(move, parentBoard, NAMED_SHAPE_PATTERNS);
  if (namedShapeInsight) return namedShapeInsight;

  const wedgeInsight = getWedgeInsight(move, nextBoard, boardSize);
  if (wedgeInsight) return wedgeInsight;

  const shoulderHitInsight = getShoulderHitInsight(move, nextBoard, boardSize);
  if (shoulderHitInsight) return shoulderHitInsight;

  const attachmentInsight = getAttachmentInsight(move, nextBoard, boardSize);
  if (attachmentInsight) return attachmentInsight;

  const emptyTriangleInsight = getEmptyTriangleInsight(move, nextBoard, boardSize);
  if (emptyTriangleInsight) return emptyTriangleInsight;

  const bambooJointInsight = getBambooJointInsight(move, nextBoard, boardSize);
  if (bambooJointInsight) return bambooJointInsight;

  const tigersMouthInsight = getTigersMouthInsight(move, nextBoard, boardSize);
  if (tigersMouthInsight) return tigersMouthInsight;

  // Turn and stretch outrank the generic diagonal/jump labels but rank below
  // the more specific contact relations checked above, and never preempt a
  // move that joins two friendly groups (labeled "Connect" below).
  if (friendlyGroups.size < 2) {
    const contactMoveInsight = getLibraryPatternInsight(move, parentBoard, CONTACT_MOVE_PATTERNS);
    if (contactMoveInsight) return contactMoveInsight;
  }

  const cutOrDiagonalInsight = getCutOrDiagonalInsight(move, nextBoard, boardSize);
  if (cutOrDiagonalInsight) return cutOrDiagonalInsight;

  const cornerRelationInsight = getCornerRelationInsight(move, parentBoard, boardSize);
  if (cornerRelationInsight) return cornerRelationInsight;

  const jumpShapeInsight = getJumpShapeInsight(move, nextBoard, boardSize);
  if (jumpShapeInsight) return jumpShapeInsight;

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

  if (parentBoard && parentBoard.length === boardSize && parentBoard[move.y]?.[move.x] === null) {
    // Whole-board fusekis and the 3-3 invasion are more specific than any
    // tactical label (e.g. a 3-3 invasion would otherwise read "Shoulder hit").
    const fusekiInsight = getLibraryPatternInsight(move, parentBoard, FUSEKI_PATTERNS);
    if (fusekiInsight) return fusekiInsight;
  }

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
  if (FUSEKI_PATTERN_NAMES.has(insight.label)) {
    if (insight.label === '3-3 Point Invasion') {
      return {
        beginner: 'The 3-3 invasion takes the corner right away but gives the opponent a strong outside wall.',
        pro: 'Time the invasion by how well the resulting wall works with the rest of the board.',
        checks: ['Wall direction', 'Timing', 'Ladder breaks'],
      };
    }
    return {
      beginner: 'This completes a named whole-board opening — a plan for the entire board, not just one corner.',
      pro: 'Study games with this formation to learn its standard follow-ups, invasion points, and direction of play.',
      checks: ['Framework plan', 'Invasion points', 'Direction of play'],
    };
  }

  if (SHAPE_PATTERN_NAMES.has(insight.label)) {
    return {
      beginner: 'This completes a classic named shape — good shape gives your stones connection and eye potential.',
      pro: 'Confirm the shape is doing real work here: efficiency matters more than the shape itself.',
      checks: ['Connection', 'Eye shape', 'Efficiency'],
    };
  }

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

  if (insight.label === 'Bamboo joint') {
    return {
      beginner: 'A bamboo joint connects lightly: if one cutting point is attacked, the other point usually reconnects.',
      pro: 'Check whether the joint is still short of liberties, vulnerable to forcing moves, or better played as a sente exchange.',
      checks: ['Cut resistance', 'Liberties', 'Aji'],
    };
  }

  if (insight.label === "Tiger's mouth") {
    return {
      beginner: "A tiger's mouth protects a cutting point while keeping the stones flexible.",
      pro: 'Check peeps, shortage of liberties, and whether the mouth points at the important side of the fight.',
      checks: ['Peep', 'Liberties', 'Direction'],
    };
  }

  if (insight.label === 'Cut') {
    return {
      beginner: 'A cut tries to split opposing stones so they must live or connect separately.',
      pro: 'Read ladders, nets, counter-cuts, and whether the cutting stones have enough liberties.',
      checks: ['Ladder', 'Net', 'Liberties'],
    };
  }

  if (insight.label === 'Hane') {
    return {
      beginner: 'A hane bends around contact and often creates pressure or shape at the same time.',
      pro: 'Read the counter-hane, cuts, ladders, and whether the bend keeps enough liberties.',
      checks: ['Counter-hane', 'Cuts', 'Liberties'],
    };
  }

  if (insight.label === 'Wedge') {
    return {
      beginner: 'A wedge pushes between opposing stones, often aiming to split them.',
      pro: 'Check whether both sides can be handled, or whether the wedge becomes a weak cutting stone.',
      checks: ['Both sides', 'Counter-cut', 'Liberties'],
    };
  }

  if (insight.label === 'Shoulder hit') {
    return {
      beginner: 'A shoulder hit leans on an opposing stone to reduce its area while building outside influence.',
      pro: 'Check direction, follow-up cuts, and whether the opponent can profit by pushing through.',
      checks: ['Direction', 'Follow-up', 'Cuts'],
    };
  }

  if (insight.label === 'Attachment') {
    return {
      beginner: 'An attachment touches an opposing stone, so both players usually need to read the local contact fight.',
      pro: 'Check hane, extend, crosscut, and whether the attachment strengthens the opponent in sente.',
      checks: ['Hane', 'Extend', 'Crosscut'],
    };
  }

  if (insight.label === 'Diagonal (kosumi)') {
    return {
      beginner: 'A diagonal move connects lightly while leaving room to shape around pressure.',
      pro: 'Check whether the diagonal is strong enough, or whether a solid connection, tiger mouth, or jump is more efficient.',
      checks: ['Cut point', 'Shape', 'Efficiency'],
    };
  }

  if (insight.label === 'One-point jump') {
    return {
      beginner: 'A one-point jump extends quickly from a friendly stone while keeping a loose connection.',
      pro: 'Check peeps, cuts, and whether the jump gives the opponent an easy forcing move.',
      checks: ['Peep', 'Cut', 'Direction'],
    };
  }

  if (insight.label === 'Two-point jump') {
    return {
      beginner: 'A two-point jump is faster than a one-point jump, but it leaves more space for the opponent to invade.',
      pro: 'Check whether nearby strength protects the gap, or whether a cap, shoulder hit, or invasion punishes the distance.',
      checks: ['Gap safety', 'Cap', 'Invasion'],
    };
  }

  if (insight.label === 'Small knight') {
    return {
      beginner: 'A small knight move is a fast, flexible connection with one common cutting weakness.',
      pro: 'Read the attachment and cut points, especially when either stone is short of liberties.',
      checks: ['Attachment', 'Cut point', 'Liberties'],
    };
  }

  if (insight.label === 'Large knight') {
    return {
      beginner: 'A large knight move is wider and faster, so it needs more support from nearby stones.',
      pro: 'Check whether the opponent can split, shoulder hit, or lean on the outside before the shape settles.',
      checks: ['Split', 'Shoulder hit', 'Support'],
    };
  }

  if (insight.label === 'Diagonal jump') {
    return {
      beginner: 'A diagonal jump links stones at a distance, often aiming for speed more than solid connection.',
      pro: 'Check the forcing points around the diagonal and whether a closer move removes important aji.',
      checks: ['Forcing points', 'Aji', 'Efficiency'],
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

  if (insight.label === 'Low approach') {
    return {
      beginner: 'A low approach asks for corner territory or a stable base while reducing the opponent.',
      pro: 'Choose the approach direction by checking pincers, extensions, ladders, and nearby strength.',
      checks: ['Pincer', 'Base', 'Direction'],
    };
  }

  if (insight.label === 'High approach') {
    return {
      beginner: 'A high approach puts more weight on outside influence and pressure than on immediate territory.',
      pro: 'Check whether the high side attacks a weak group, builds a moyo, or gives the opponent an easy base.',
      checks: ['Influence', 'Target', 'Pincer'],
    };
  }

  if (insight.label === 'Low enclosure') {
    return {
      beginner: 'A low enclosure secures the corner and makes the stones harder to invade.',
      pro: 'Check whether enclosing is bigger than approaching another corner, extending, or taking sente.',
      checks: ['Corner secure', 'Extension', 'Sente'],
    };
  }

  if (insight.label === 'High enclosure') {
    return {
      beginner: 'A high enclosure builds a wider corner shape and points more toward outside influence.',
      pro: 'Check approach timing, outside direction, and whether the wider shape leaves useful invasion aji.',
      checks: ['Direction', 'Invasion aji', 'Follow-up'],
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
