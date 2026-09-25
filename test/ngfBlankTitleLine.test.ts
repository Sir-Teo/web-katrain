import { describe, expect, it } from 'vitest';
import { convertNgfToSgf } from '../src/utils/gameRecordImport';
import { parseSgf } from '../src/utils/sgf';

describe('NGF with an empty first (title) line', () => {
  it('reads the header by position', () => {
    const lines = ['', '19', 'White Player 7D*', 'Black Player 5DP', 'www.cyberoro.com',
      '0', '0', '6', '20170316 [09:51]', '5', 'White wins by resign!', '2', 'PMABBQDDQ', 'PMACWDDDD'];
    const sgf = convertNgfToSgf(lines.join('\r\n'));
    expect(parseSgf(sgf).tree!.props).toMatchObject({ SZ: ['19'], PW: ['White Player'], KM: ['6.5'], RE: ['W+R'] });
  });
});
