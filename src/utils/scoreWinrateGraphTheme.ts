import type { CSSProperties } from 'react';
import type { UiThemeId } from '../types';
import { publicUrl } from './publicUrl';

const KATRAN_BOX_BG = 'rgb(46, 65, 88)';
const KATRAN_SCORE_COLOR = 'rgb(77, 179, 230)';
const KATRAN_WINRATE_COLOR = 'rgb(26, 204, 26)';
const KATRAN_GRAPH_DOT_COLOR = 'rgb(217, 77, 77)';
const KATRAN_GRAPH_BG_URL = publicUrl('katrain/graph_bg.png');
const KATRAN_SCORE_MARKER_COLOR = 'rgb(51, 153, 204)';
const KATRAN_WINRATE_MARKER_COLOR = 'rgb(13, 179, 13)';

export type ScoreWinrateGraphTheme = {
  boxStyle: CSSProperties;
  scoreColor: string;
  winrateColor: string;
  dotColor: string;
  scoreMarkerColor: string;
  winrateMarkerColor: string;
  hoverLineColor: string;
  qualityMarkerStroke: string;
  emptyOverlayClass: string;
  emptyBadgeClass: string;
  emptyActionClass: string;
  tooltipClass: string;
};

export function getScoreWinrateGraphTheme(uiTheme: UiThemeId): ScoreWinrateGraphTheme {
  if (uiTheme === 'light') {
    return {
      boxStyle: {
        backgroundColor: 'rgb(248, 250, 252)',
        backgroundImage: [
          'linear-gradient(to right, rgba(148, 163, 184, 0.22) 1px, transparent 1px)',
          'linear-gradient(to bottom, rgba(148, 163, 184, 0.22) 1px, transparent 1px)',
        ].join(', '),
        backgroundSize: '20px 20px, 20px 20px',
        backgroundRepeat: 'repeat',
      },
      scoreColor: 'rgb(2, 132, 199)',
      winrateColor: 'rgb(22, 163, 74)',
      dotColor: 'rgb(225, 29, 72)',
      scoreMarkerColor: 'rgb(2, 132, 199)',
      winrateMarkerColor: 'rgb(22, 163, 74)',
      hoverLineColor: 'rgb(100, 116, 139)',
      qualityMarkerStroke: 'rgba(15, 23, 42, 0.35)',
      emptyOverlayClass: 'pointer-events-none absolute inset-0 z-10 grid place-items-center bg-white/35 px-3 text-center',
      emptyBadgeClass: 'flex flex-col items-center gap-1.5 rounded border border-[var(--ui-border)] bg-white/90 px-3 py-2 text-[11px] font-semibold text-[var(--ui-text)] shadow-sm',
      emptyActionClass: 'pointer-events-auto inline-flex items-center rounded border border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ui-accent)] hover:brightness-105',
      tooltipClass: 'absolute rounded border border-[var(--ui-border)] bg-white/95 px-2 py-1 text-[10px] text-[var(--ui-text)] shadow-sm pointer-events-none',
    };
  }

  return {
    boxStyle: {
      backgroundColor: KATRAN_BOX_BG,
      backgroundImage: `url('${KATRAN_GRAPH_BG_URL}')`,
      backgroundSize: '100% 100%',
      backgroundRepeat: 'no-repeat',
    },
    scoreColor: KATRAN_SCORE_COLOR,
    winrateColor: KATRAN_WINRATE_COLOR,
    dotColor: KATRAN_GRAPH_DOT_COLOR,
    scoreMarkerColor: KATRAN_SCORE_MARKER_COLOR,
    winrateMarkerColor: KATRAN_WINRATE_MARKER_COLOR,
    hoverLineColor: 'rgb(128,128,128)',
    qualityMarkerStroke: 'rgba(255,255,255,0.72)',
    emptyOverlayClass: 'pointer-events-none absolute inset-0 z-10 grid place-items-center bg-black/20 px-3 text-center',
    emptyBadgeClass: 'flex flex-col items-center gap-1.5 rounded border border-white/15 bg-black/55 px-3 py-2 text-[11px] font-semibold text-white/85 shadow-sm',
    emptyActionClass: 'pointer-events-auto inline-flex items-center rounded border border-[var(--ui-accent)] bg-[var(--ui-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ui-accent)] hover:brightness-110',
    tooltipClass: 'absolute bg-black bg-opacity-80 text-white text-[10px] px-2 py-1 rounded pointer-events-none',
  };
}
