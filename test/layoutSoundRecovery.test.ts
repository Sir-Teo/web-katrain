import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('layout sound recovery', () => {
  it('registers sound failures as a user-visible auto-disable notification', () => {
    const source = readFileSync('src/components/Layout.tsx', 'utf8');

    expect(source).toContain('setSoundInitErrorHandler((error) => {');
    expect(source).toContain('updateSettings({ soundEnabled: false });');
    expect(source).toContain('Sound disabled because browser audio is unavailable.');
    expect(source).toContain('return () => setSoundInitErrorHandler(null);');
  });
});
