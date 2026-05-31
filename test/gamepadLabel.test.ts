import { describe, expect, it } from 'vitest';
import { formatGamepadLabel } from '../src/utils/gamepadLabel';

describe('formatGamepadLabel', () => {
  it('normalizes empty and whitespace-only names', () => {
    expect(formatGamepadLabel(null)).toBe('Gamepad');
    expect(formatGamepadLabel('   ')).toBe('Gamepad');
    expect(formatGamepadLabel('Xbox   Wireless   Controller')).toBe('Xbox Wireless Controller');
  });

  it('truncates long names with an ASCII ellipsis', () => {
    expect(formatGamepadLabel('Very Long Controller Name For QA', 18)).toBe('Very Long Contr...');
    expect(formatGamepadLabel('abcdef', 3)).toBe('abc');
  });
});
