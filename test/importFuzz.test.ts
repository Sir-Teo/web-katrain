import { expect, it } from 'vitest';
import { parseSgf, expandSgfPointList, sgfCoordToXy } from '../src/utils/sgf';
import { unsupportedSgfBoardSize } from '../src/utils/boardSize';
import { getPasteSgfInputInfo, getDirectGameImportText } from '../src/utils/pasteSgfInput';
import { assertValidLibrarySgfImport } from '../src/utils/libraryImportValidation';
import { decodeSgfFromFragment } from '../src/utils/shareLink';
import { extractOgsGameId, isOgsUrl } from '../src/utils/ogs';
import { decodeKayaOwnership } from '../src/utils/kayaSgfAnalysis';

/**
 * Every parser here reads text the app did not write: a paste, a dropped file,
 * a share link, an SGF property saved by another program. web-chess found a
 * quadratic comment scan this way, and web-xiangqi had the same bug in two
 * places; both were regexes asked to backtrack until they found a closing
 * delimiter. This repo's SGF reader is a hand-written character scanner and
 * does not have that shape — that is the property being pinned, not assumed.
 *
 * The assertion is a time bound rather than a value: what makes a wrong file
 * dangerous is not that it parses to the wrong thing, it is that it never
 * comes back.
 */
/**
 * What counts as "did not hang".
 *
 * This was 1000ms, which is roughly four times the slowest case on a developer
 * machine and turned out not to be enough: `many properties on one node` runs
 * in 171-231ms here and took 1043ms on a GitHub runner, failing the suite by
 * 4%. Shared CI hardware is around five times slower than the machine this was
 * calibrated on, so a budget with 4x headroom locally has none there.
 *
 * The number is deliberately generous rather than tuned. What this file is for
 * is catching a parser that hangs or goes quadratic on hostile input -- failure
 * modes measured in seconds and minutes, not in the difference between 200ms
 * and 1000ms. Five seconds still catches all of those and leaves roughly five
 * times headroom over the slowest run actually observed in CI.
 */
const BUDGET_MS = 5000;

const NASTY: Array<[string, string]> = [
  ['empty', ''],
  ['bare paren', '('],
  ['bare semicolon', ';'],
  ['unclosed tree', '(;GM[1]SZ[19];B[pd]'],
  ['unclosed property', '(;GM[1]SZ[19];B[pd'],
  ['unclosed comment', '(;GM[1]C[never closed'],
  ['deep nesting', '(;GM[1]SZ[19]' + '(;B[aa]'.repeat(5000) + ')'.repeat(5000)],
  ['many open brackets', '['.repeat(20000)],
  ['many open parens', '('.repeat(20000)],
  ['alternating delimiters', '(;[]'.repeat(20000)],
  ['long token', '(;GM[1]C[' + 'x'.repeat(200000) + '])'],
  ['long unterminated token', '(;GM[1]C[' + 'x'.repeat(200000)],
  ['many nodes', '(;GM[1]SZ[19]' + ';B[aa];W[bb]'.repeat(20000) + ')'],
  ['many properties on one node', '(;GM[1]' + 'AB[aa]'.repeat(20000) + ')'],
  ['escaped closing brackets', '(;GM[1]C[' + '\\]'.repeat(20000) + '])'],
  ['bad board size', '(;GM[1]SZ[999999999]AB[aa:zz])'],
  ['negative board size', '(;GM[1]SZ[-19]AB[aa:zz])'],
  ['non-numeric board size', '(;GM[1]SZ[abc];B[pd])'],
  ['high code point coordinates', '(;GM[1]SZ[19]AB[￿￿:aa])'],
  ['lone surrogates', '(;GM[1]C[\ud800\ud800\ud800])'],
  ['nul bytes', '(;GM[1]C[\0\0\0];B[\0\0])'],
  ['not an sgf at all', '{"json":true}'.repeat(20000)],
  ['minified script', 'function f(){return[1,2,3]}'.repeat(20000)],
];

for (const [name, input] of NASTY) {
  it(`survives: ${name}`, () => {
    const started = performance.now();

    // Each of these reads text from outside the app. None may hang, and none
    // may throw anything other than a parse error.
    try { parseSgf(input); } catch { /* an invalid SGF is expected to throw */ }
    try { assertValidLibrarySgfImport(input); } catch { /* likewise */ }
    expandSgfPointList(input, 19);
    expandSgfPointList(input);
    sgfCoordToXy(input);
    unsupportedSgfBoardSize(input);
    getPasteSgfInputInfo(input);
    getDirectGameImportText(input);
    decodeSgfFromFragment(input);
    extractOgsGameId(input);
    isOgsUrl(input);
    decodeKayaOwnership(input);

    const elapsed = performance.now() - started;
    expect(elapsed, `${name} took ${elapsed.toFixed(0)}ms`).toBeLessThan(BUDGET_MS);
  });
}
