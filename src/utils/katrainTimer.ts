import type { Player } from '../types';

export type KaTrainTimerStepArgs = {
  nowMs: number;
  lastUpdateMs: number;
  lastUpdateNodeId: string | null;
  currentNodeId: string;
  currentNodeHasChildren: boolean;

  paused: boolean;
  isAiTurn: boolean;

  mainTimeMinutes: number;
  byoLengthSeconds: number;
  byoPeriods: number;

  currentPlayer: Player;
  mainTimeUsedSeconds: number;
  nodeTimeUsedSeconds: number;
  periodsUsedForPlayer: number;
};

export type KaTrainTimerDisplay = {
  timeSeconds: number;
  periodsRemaining: number | null;
  timeout: boolean;
  isAiTurn: boolean;
};

export type KaTrainTimerStepResult = {
  lastUpdateMs: number;
  lastUpdateNodeId: string;
  mainTimeUsedSeconds: number;
  nodeTimeUsedSeconds: number;
  periodsUsedForPlayer: number;
  display: KaTrainTimerDisplay;
};

export function formatKaTrainClockSeconds(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds + 0.99));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2, '0')}`;
}

export function stepKaTrainTimer(args: KaTrainTimerStepArgs): KaTrainTimerStepResult {
  const nowMs = args.nowMs;
  const lastUpdateMs = Number.isFinite(args.lastUpdateMs) ? args.lastUpdateMs : nowMs;

  const dtSec = Math.max(0, (nowMs - lastUpdateMs) / 1000);

  const mainTimeSeconds = Math.max(0, Math.floor(args.mainTimeMinutes * 60));
  const byoLengthSeconds = Math.max(1, Math.floor(args.byoLengthSeconds));
  const byoPeriods = Math.max(1, Math.floor(args.byoPeriods));

  let mainTimeUsedSeconds = Math.max(0, args.mainTimeUsedSeconds);
  let nodeTimeUsedSeconds = Math.max(0, args.nodeTimeUsedSeconds);
  let periodsUsedForPlayer = Math.max(0, Math.floor(args.periodsUsedForPlayer));

  const isRunning = !args.paused && !args.isAiTurn;
  const isSameNode = args.lastUpdateNodeId === args.currentNodeId;
  const isLeaf = !args.currentNodeHasChildren;

  if (isRunning) {
    if (isSameNode && isLeaf) {
      const mainTimeRemaining = mainTimeSeconds - mainTimeUsedSeconds;
      if (mainTimeRemaining > 0) mainTimeUsedSeconds += dtSec;
      else nodeTimeUsedSeconds += dtSec;
    } else {
      nodeTimeUsedSeconds = 0;
    }

    const mainTimeRemaining = mainTimeSeconds - mainTimeUsedSeconds;
    if (mainTimeRemaining <= 0) {
      let timeRemaining = byoLengthSeconds - nodeTimeUsedSeconds;
      while (timeRemaining < 0 && periodsUsedForPlayer < byoPeriods) {
        nodeTimeUsedSeconds -= byoLengthSeconds;
        timeRemaining += byoLengthSeconds;
        periodsUsedForPlayer += 1;
      }
    }
  }

  const mainTimeRemaining = mainTimeSeconds - mainTimeUsedSeconds;
  const periodsRemaining = byoPeriods - periodsUsedForPlayer;
  const timeout = mainTimeRemaining <= 0 && periodsRemaining <= 0;

  const display: KaTrainTimerDisplay =
    mainTimeRemaining > 0
      ? {
          timeSeconds: mainTimeRemaining,
          periodsRemaining: null,
          timeout: false,
          isAiTurn: args.isAiTurn,
        }
      : {
          timeSeconds: timeout ? 0 : Math.max(0, byoLengthSeconds - nodeTimeUsedSeconds),
          periodsRemaining: Math.max(0, periodsRemaining),
          timeout,
          isAiTurn: args.isAiTurn,
        };

  return {
    lastUpdateMs: nowMs,
    lastUpdateNodeId: args.currentNodeId,
    mainTimeUsedSeconds,
    nodeTimeUsedSeconds,
    periodsUsedForPlayer,
    display,
  };
}

