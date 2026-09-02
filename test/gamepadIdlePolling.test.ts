import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('gamepad idle polling', () => {
  it('only schedules animation frames while a controller is connected', () => {
    const source = readFileSync('src/hooks/useGamepadNavigation.ts', 'utf8');

    expect(source).toContain('if (!gamepad || stopped)');
    expect(source).toContain('if (frame === null) frame = requestAnimationFrameSafe(tick);');
    expect(source).toContain('handleConnectChange();');
    expect(source).not.toMatch(/\n\s*tick\(\);\n/);
  });
});
