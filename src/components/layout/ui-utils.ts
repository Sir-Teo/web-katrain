export function rgba(color: readonly [number, number, number, number], alphaOverride?: number): string {
  const a = typeof alphaOverride === 'number' ? alphaOverride : color[3];
  return `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)}, ${a})`;
}

export function formatMoveLabel(x: number, y: number): string {
  if (x < 0 || y < 0) return 'Pass';
  const col = String.fromCharCode(65 + (x >= 8 ? x + 1 : x));
  const row = 19 - y;
  return `${col}${row}`;
}

export function playerToShort(p: 'black' | 'white'): string {
  return p === 'black' ? 'B' : 'W';
}

export const panelCardBase = 'panel-section';
export const panelCardOpen = '';
export const panelCardClosed = '';
