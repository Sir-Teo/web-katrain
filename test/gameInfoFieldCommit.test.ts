import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('game info text fields', () => {
  it('save when the edit ends, not on every keystroke', () => {
    // setRootProperty trims, so saving each keystroke dropped a space typed at
    // the end of the text before the next letter arrived: typing "Lee Sedol"
    // stored "LeeSedol". The field holds the draft and commits on blur.
    const source = readFileSync('src/components/GameInfoPanel.tsx', 'utf8');

    expect(source).not.toMatch(/onChange=\{\(e\) => setRootProperty\(/);
    expect(source).toContain('const GameInfoTextField');
    expect(source).toContain('onBlur={commit}');
    expect(source).toMatch(/<GameInfoTextField key=\{field\.key\}[^>]*onCommit=\{setRootProperty\}/);
  });
});
