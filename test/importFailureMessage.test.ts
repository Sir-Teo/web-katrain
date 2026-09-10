import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { withFailureReason } from '../src/utils/importSummary';
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

describe('withFailureReason', () => {
  it('says why, using the parser own words', () => {
    const error = reasonFor('(;GM[1]FF[4]SZ[19];B[aa]');

    expect(error, 'the sample should not parse').toBeTruthy();
    const message = withFailureReason('Could not open "game.sgf".', error);
    expect(message.startsWith('Could not open "game.sgf". ')).toBe(true);
    expect(message).toContain('Invalid SGF');
    expect(message.endsWith('.')).toBe(true);
  });

  it('does not double the full stop the reason already has', () => {
    expect(withFailureReason('Could not open it.', new Error('The file is empty.')))
      .toBe('Could not open it. The file is empty.');
  });

  it('says the plain thing when there is nothing to add', () => {
    expect(withFailureReason('Could not open it.', null)).toBe('Could not open it.');
    expect(withFailureReason('Could not open it.', new Error('   '))).toBe('Could not open it.');
    expect(withFailureReason('Could not open it.', 'a string, not an Error'))
      .toBe('Could not open it.');
  });
});

describe('a failure toast says why', () => {
  it('leaves no error caught, announced, and explained away', () => {
    // Every one of these threw the reason away and said only that something had
    // failed, which cannot tell a corrupt file from a broken app, or a full
    // disk from a bug.
    const layout = readFileSync('src/components/Layout.tsx', 'utf8');
    const bare = [...layout.matchAll(/\} catch \{\s*\n\s*([^\n]*toast\([^\n]*)/g)]
      .map((match) => match[1]!.trim())
      .filter((line) => !line.includes('withFailureReason') && !line.includes('error instanceof Error'));

    expect(bare, 'these catch an error and drop it').toEqual([]);
    expect((layout.match(/withFailureReason\(/g) ?? []).length).toBeGreaterThanOrEqual(12);
  });
});
