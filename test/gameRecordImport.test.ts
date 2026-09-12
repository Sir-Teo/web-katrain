import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  convertGibToSgf, convertNgfToSgf, decodeGameRecordBytes, gameRecordFormat,
  isGameRecordFile, readGameRecordFile,
} from '../src/utils/gameRecordImport';
import { parseSgf } from '../src/utils/sgf';
import { decodeSgfBytes } from '../src/utils/sgfEncoding';
import { MAX_SGF_IMPORT_BYTES } from '../src/utils/sgfImportLimits';

const utf8 = (value: string) => new TextEncoder().encode(value);
const fixture = (name: string) => readFileSync(new URL(`./fixtures/legacy-games/${name}`, import.meta.url));
const ngf = (overrides: Record<number, string> = {}, moves = ['PMABWQRRQ', 'PMACBEEEE', 'PMADWAAAA']) => {
  const lines = ['Friendly game', '19', 'White Player 7D*', 'Black Player 5DP', 'www.cyberoro.com',
    '2', '0', '0', '20170316 [09:51]', '5', 'White wins by resign!', String(moves.length)];
  for (const [index, value] of Object.entries(overrides)) lines[Number(index)] = value;
  return [...lines, ...moves].join('\n');
};

describe('Tygem GIB records', () => {
  it('preserves Korean names, komi, result, date, moves, and the special third handicap stone', () => {
    const sgf = decodeGameRecordBytes(fixture('tygem-korean.gib'), 'gib');
    const parsed = parseSgf(sgf);
    expect(parsed.tree!.props).toMatchObject({
      PB: ['이창호'], BR: ['9D'], PW: ['조훈현'], WR: ['9D'], KM: ['6.5'],
      RE: ['B+R'], DT: ['2020-06-14'], HA: ['3'], AB: ['pd', 'dp', 'dd'], PL: ['W'], CA: ['UTF-8'],
    });
    expect(parsed.moves).toEqual([
      { player: 'white', x: 15, y: 15 }, { player: 'black', x: 9, y: 9 },
    ]);
    expect(decodeSgfBytes(utf8(sgf))).toBe(sgf);
  });

  it('uses an explicit Chinese decoder and safely escapes SGF-looking player names', () => {
    const sgf = decodeGameRecordBytes(fixture('tygem-chinese.gib'), 'gib', 'gb18030');
    expect(parseSgf(sgf).tree!.props).toMatchObject({ PB: ['柯洁'], PW: ['古力'] });
    const name = 'Player ]\\(;B[aa])';
    const escaped = convertGibToSgf(`\\[GAMEBLACKNAME=${name} (3D)\\]\nSTO 0 1 1 3 3`);
    expect(parseSgf(escaped).tree!.props).toMatchObject({ PB: [name], BR: ['3D'] });
    expect(parseSgf(escaped).moves).toHaveLength(1);
  });

  it.each([[0, 'B+2.5'], [1, 'W+2.5'], [3, 'B+R'], [4, 'W+R'], [7, 'B+T'], [8, 'W+T']])(
    'converts result code %s', (code, expected) => {
      const sgf = convertGibToSgf(`\\[GAMEINFOMAIN=GRLT:${code},ZIPSU:25,GONGJE:0\\]\nSTO 0 1 1 0 18`);
      expect(parseSgf(sgf).tree!.props).toMatchObject({ RE: [expected], KM: ['0'] });
      expect(parseSgf(sgf).moves).toEqual([{ player: 'black', x: 0, y: 18 }]);
    },
  );

  it('uses GAMETAG metadata when the main header is absent and prefers the main header regardless of order', () => {
    const text = '\\[GAMETAG=G75,W8,Z0,C2024:02:29:12:00,\\]\nSTO 0 1 1 3 3';
    expect(parseSgf(convertGibToSgf(text)).tree!.props).toMatchObject({ KM: ['7.5'], RE: ['W+T'], DT: ['2024-02-29'] });
    expect(parseSgf(convertGibToSgf(`${text}\n\\[GAMEINFOMAIN=GRLT:3,GONGJE:65,\\]`)).tree!.props)
      .toMatchObject({ KM: ['6.5'], RE: ['B+R'] });
  });

  it.each(['STO 0 1 1 19 0', 'STO 0 1 1 3.5 3', 'STO 0 1 3 3 3', 'STO 0 1', 'INI 0 1 10'])('rejects a malformed record instead of dropping a move: %s', (line) => {
    expect(() => convertGibToSgf(`STO 0 1 1 3 3\n${line}`)).toThrow(/Invalid GIB|Unexpected GIB/);
  });
  it('rejects missing moves and invalid initial handicaps', () => {
    expect(() => convertGibToSgf('INI 0 1 0')).toThrow(/no moves/);
    expect(() => convertGibToSgf('INI 0 1 -1\nSTO 0 1 1 3 3')).toThrow(/invalid handicap/);
  });
});

describe('wBaduk NGF records', () => {
  it('preserves Japanese names, professional ranks, zero komi, handicap placement, and passes', () => {
    const parsed = parseSgf(decodeGameRecordBytes(fixture('wbaduk-japanese.ngf'), 'ngf', 'shift_jis'));
    expect(parsed.tree!.props).toMatchObject({
      PW: ['本因坊'], PB: ['高尾紳路'], WR: ['9p'], BR: ['9p'],
      KM: ['0'], HA: ['2'], AB: ['pd', 'dp'], RE: ['W+R'], DT: ['2024-09-01'],
    });
    expect(parsed.moves).toEqual([
      { player: 'white', x: 15, y: 16 }, { player: 'black', x: 3, y: 3 }, { player: 'white', x: -1, y: -1 },
    ]);
  });

  it.each([['6', '6.5'], ['6.5', '6.5'], ['7.5', '7.5']])('interprets even-game komi %s as %s', (value, expected) => {
    expect(parseSgf(convertNgfToSgf(ngf({ 5: '0', 7: value }))).tree!.props.KM).toEqual([expected]);
  });

  it.each([9, 13, 19])('places Tygem handicap stones on a %s board', (size) => {
    const parsed = parseSgf(convertNgfToSgf(ngf({ 1: String(size), 5: '3' }, ['PMABWFF'])));
    const near = size === 9 ? 'c' : 'd';
    const far = String.fromCharCode(97 + size - 1 - (size === 9 ? 2 : 3));
    expect(parsed.tree!.props.AB).toEqual([far + near, near + far, near + near]);
  });

  it('preserves names with spaces and does not mistake a PM-prefixed name for a move', () => {
    const props = parseSgf(convertNgfToSgf(ngf({ 2: 'PM Player 7D*' }))).tree!.props;
    expect(props).toMatchObject({ PW: ['PM Player'], PB: ['Black Player'], WR: ['7d*'], BR: ['5p'] });
  });

  it.each([['Black wins by 3.5 points', 'B+3.5'], ['Black loses on time', 'W+T'], ['Draw', '0']])('preserves result %s', (value, expected) => {
    expect(parseSgf(convertNgfToSgf(ngf({ 10: value }))).tree!.props.RE).toEqual([expected]);
  });

  it.each(['PMABWAZ', 'PMABWZZ', 'PMABXDD', 'PMABW'])('rejects invalid coordinates or player: %s', (move) => {
    expect(() => convertNgfToSgf(ngf({}, [move]))).toThrow(/Invalid NGF move/);
  });
  it('rejects unsupported board sizes and bad headers before producing a partial game', () => {
    expect(() => convertNgfToSgf(ngf({ 1: '15' }))).toThrow(/board size/);
    expect(() => convertNgfToSgf(ngf({ 5: '10' }))).toThrow(/handicap/);
    expect(() => convertNgfToSgf(ngf({ 7: 'unknown' }))).toThrow(/komi/);
    expect(() => convertNgfToSgf(ngf({}, []))).toThrow(/no moves/);
  });
});

describe('game file decoding', () => {
  it('recognizes case-insensitive extensions and an SGF MIME type', () => {
    expect(gameRecordFormat('Study.GIB')).toBe('gib');
    expect(isGameRecordFile({ name: 'study.NGF' })).toBe(true);
    expect(isGameRecordFile({ name: 'download', type: 'application/x-go-sgf' })).toBe(true);
    expect(isGameRecordFile({ name: 'study.sgf.exe' })).toBe(false);
  });
  it('keeps SGF charset declarations authoritative regardless of the legacy setting', () => {
    const bytes = new Uint8Array([...utf8('(;SZ[9]CA[ISO-8859-1]PB['), 0xe9, ...utf8('];B[dd])')]);
    expect(parseSgf(decodeGameRecordBytes(bytes, 'sgf', 'shift_jis')).tree!.props.PB).toEqual(['é']);
  });
  it('accepts UTF-8 and BOM-marked UTF-16 legacy records', async () => {
    const text = ngf({ 2: '이창호 9DP' });
    const bytes = new Uint8Array([0xff, 0xfe, ...Buffer.from(text, 'utf16le')]);
    expect(parseSgf(decodeGameRecordBytes(bytes, 'ngf', 'shift_jis')).tree!.props.PW).toEqual(['이창호']);
    const file = new File([utf8(text)], 'game.NGF');
    expect(parseSgf(await readGameRecordFile(file)).tree!.props.PW).toEqual(['이창호']);
  });
  it('reports invalid encoded text and rejects oversized files before reading them', async () => {
    expect(() => decodeGameRecordBytes(new Uint8Array([0xff]), 'gib', 'utf-8')).toThrow(/encoding/);
    const arrayBuffer = vi.fn();
    await expect(readGameRecordFile({ name: 'huge.gib', size: MAX_SGF_IMPORT_BYTES + 1, arrayBuffer } as unknown as File)).rejects.toThrow(/5 MB/);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
});
