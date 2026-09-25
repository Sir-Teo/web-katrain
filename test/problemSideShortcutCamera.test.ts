import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSgf } from '../src/utils/sgf';
import { useGameStore } from '../src/store/gameStore';
import { getProblemStarts, problemSideToMove, classifyProblemNode, findChildForMove } from '../src/utils/problemMode';

describe('side to move in a problem collection', () => {
  it('takes an unmarked problem\'s side from its first move', () => {
    const sgf = '(;GM[1]SZ[9]' +
      '(;AB[cc][dc]AW[cd][dd]C[Black to play];B[ec]GB[1])' +
      '(;AB[ee][fe]AW[ef][ff]C[White to play];W[ge]GW[1]))';
    useGameStore.getState().loadGame(parseSgf(sgf));
    const root = useGameStore.getState().rootNode;
    const starts = getProblemStarts(root);
    expect(starts.length).toBe(2);
    const p2 = starts[1]!;
    const side = problemSideToMove(p2);
    const child = findChildForMove(p2, 6, 4)!;
    expect(side).toBe('white');
    expect(classifyProblemNode(child, side)).toBe('correct');
  });
});

describe('shortcut recording', () => {
  it('stops recording when the player clicks or tabs elsewhere', () => {
    const source = readFileSync('src/components/ShortcutSettingsPanel.tsx', 'utf8');

    // Left armed, a click into the search box and "undo" rebound a command to U.
    expect(source).toContain("window.addEventListener('pointerdown', handleElsewhere, true);");
    expect(source).toContain("window.addEventListener('focusin', handleElsewhere, true);");
    expect(source).toContain("data-shortcut-recording={isRecording ? 'true' : undefined}");
  });
});

describe('camera capture', () => {
  it('reopens itself when the effect runs again', () => {
    const source = readFileSync('src/components/CameraCaptureModal.tsx', 'utf8');
    const effect = source.slice(source.indexOf('React.useEffect(() => {\n    let cancelled = false;'));

    // StrictMode's second run left the closed flag set, so captures were dropped.
    expect(effect.indexOf('closedRef.current = false;')).toBeGreaterThan(-1);
    expect(effect.indexOf('closedRef.current = false;')).toBeLessThan(effect.indexOf('getUserMedia'));
  });
});
