import { describe, expect, it } from 'vitest';
import { libraryNameRepeatsPlayers } from '../src/utils/library';

describe('libraryNameRepeatsPlayers', () => {
  it('spots the pair an imported record leads with', () => {
    expect(
      libraryNameRepeatsPlayers('Gu Li vs Lee Sedol - 10th LG Cup, semi-final', 'Gu Li', 'Lee Sedol')
    ).toBe(true);
  });

  it('ignores case and surrounding whitespace on the names', () => {
    expect(libraryNameRepeatsPlayers('gu li VS lee sedol', '  Gu Li ', ' Lee Sedol ')).toBe(true);
  });

  it('keeps the meta line when the name says something else', () => {
    expect(libraryNameRepeatsPlayers('Tuesday review', 'Gu Li', 'Lee Sedol')).toBe(false);
    expect(libraryNameRepeatsPlayers('Lee Sedol vs Gu Li', 'Gu Li', 'Lee Sedol')).toBe(false);
  });

  it('keeps the meta line when either player is unknown', () => {
    expect(libraryNameRepeatsPlayers('Gu Li vs White', 'Gu Li', undefined)).toBe(false);
    expect(libraryNameRepeatsPlayers('Black vs Lee Sedol', '  ', 'Lee Sedol')).toBe(false);
  });
});
