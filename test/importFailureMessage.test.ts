import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { describeImportFailure } from '../src/utils/importSummary';
import { parseSgf } from '../src/utils/sgf';

/** What the parser actually throws for a file someone might really open. */
const reasonFor = (sgf: string): unknown => {
  try {
    parseSgf(sgf);
    return null;
  } catch (error) {
    return error;
  }
};

describe('describeImportFailure', () => {
  it('says why, using the parser own words', () => {
    const error = reasonFor('(;GM[1]FF[4]SZ[19];B[aa]');

    expect(error, 'the sample should not parse').toBeTruthy();
    const message = describeImportFailure('Could not open "game.sgf".', error);
    expect(message.startsWith('Could not open "game.sgf". ')).toBe(true);
    expect(message).toContain('Invalid SGF');
    expect(message.endsWith('.')).toBe(true);
  });

  it('does not double the full stop the reason already has', () => {
    expect(describeImportFailure('Could not open it.', new Error('The file is empty.')))
      .toBe('Could not open it. The file is empty.');
  });

  it('says the plain thing when there is nothing to add', () => {
    expect(describeImportFailure('Could not open it.', null)).toBe('Could not open it.');
    expect(describeImportFailure('Could not open it.', new Error('   '))).toBe('Could not open it.');
    expect(describeImportFailure('Could not open it.', 'a string, not an Error'))
      .toBe('Could not open it.');
  });
});

describe('every import path says why it failed', () => {
  it('leaves no bare failure message behind', () => {
    // Three paths threw the reason away and said only that something failed,
    // which cannot tell a corrupt file from a broken app.
    const layout = readFileSync('src/components/Layout.tsx', 'utf8');

    expect(layout).not.toContain("'Failed to parse SGF file.'");
    expect(layout).not.toContain("'Failed to load SGF from library.'");
    expect(layout).not.toContain("'Failed to load SGF or OGS URL.'");
    expect((layout.match(/describeImportFailure\(/g) ?? []).length).toBe(3);
  });
});
