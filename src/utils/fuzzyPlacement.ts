export type FuzzyStoneOffset = {
  dxFactor: number;
  dyFactor: number;
};

const FUZZY_OFFSETS: readonly FuzzyStoneOffset[] = [
  { dxFactor: 0, dyFactor: 0 },
  { dxFactor: -0.08, dyFactor: 0 },
  { dxFactor: 0, dyFactor: -0.08 },
  { dxFactor: 0.08, dyFactor: 0 },
  { dxFactor: 0, dyFactor: 0.08 },
  { dxFactor: -0.05, dyFactor: -0.05 },
  { dxFactor: 0.05, dyFactor: -0.05 },
  { dxFactor: 0.05, dyFactor: 0.05 },
  { dxFactor: -0.05, dyFactor: 0.05 },
];

function stableHash(boardSize: number, x: number, y: number): number {
  let hash = 2166136261;
  hash = Math.imul(hash ^ boardSize, 16777619);
  hash = Math.imul(hash ^ x, 16777619);
  hash = Math.imul(hash ^ y, 16777619);
  return hash >>> 0;
}

export function fuzzyStoneOffset(boardSize: number, x: number, y: number, enabled: boolean): FuzzyStoneOffset {
  if (!enabled) return FUZZY_OFFSETS[0]!;
  return FUZZY_OFFSETS[stableHash(boardSize, x, y) % FUZZY_OFFSETS.length]!;
}
