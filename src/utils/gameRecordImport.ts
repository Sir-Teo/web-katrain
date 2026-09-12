import { getHandicapPoints, isBoardSize } from './boardSize';
import type { BoardSize } from '../types';
import { escapeSgfValue } from './sgf';
import { decodeSgfBytes } from './sgfEncoding';
import { assertSgfImportSize } from './sgfImportLimits';

export type GameRecordFormat = 'sgf' | 'gib' | 'ngf';
export type LegacyGameEncoding = 'auto' | 'utf-8' | 'euc-kr' | 'gb18030' | 'big5' | 'shift_jis' | 'windows-1252';
export const GAME_RECORD_ACCEPT = '.sgf,.gib,.ngf';
export const GAME_RECORD_EXTENSION = /\.(sgf|gib|ngf)$/i;
export const LEGACY_GAME_ENCODINGS: ReadonlyArray<{ value: LegacyGameEncoding; label: string }> = [
  { value: 'auto', label: 'Auto: UTF-8, then Korean' },
  { value: 'utf-8', label: 'Unicode (UTF-8)' },
  { value: 'euc-kr', label: 'Korean (EUC-KR)' },
  { value: 'gb18030', label: 'Simplified Chinese (GBK / GB18030)' },
  { value: 'big5', label: 'Traditional Chinese (Big5)' },
  { value: 'shift_jis', label: 'Japanese (Shift-JIS)' },
  { value: 'windows-1252', label: 'Western European (Windows-1252)' },
];

export const isLegacyGameEncoding = (value: unknown): value is LegacyGameEncoding =>
  LEGACY_GAME_ENCODINGS.some((option) => option.value === value);

export const gameRecordFormat = (name: string): GameRecordFormat | null =>
  (GAME_RECORD_EXTENSION.exec(name)?.[1]?.toLowerCase() as GameRecordFormat | undefined) ?? null;

export const isGameRecordFile = (file: { name: string; type?: string }): boolean =>
  gameRecordFormat(file.name) !== null || file.type === 'application/x-go-sgf';

type Properties = Record<string, string[]>;
type RecordMove = { color: 'B' | 'W'; point: string };
const coordinate = (x: number, y: number): string => String.fromCharCode(97 + x, 97 + y);
const properties = (size: BoardSize): Properties => ({ GM: ['1'], FF: ['4'], CA: ['UTF-8'], SZ: [String(size)] });

function serializeRecord(root: Properties, moves: RecordMove[]): string {
  if (!moves.length) throw new Error('The game record contains no moves.');
  root.PL = [moves[0]!.color];
  const props = Object.entries(root).map(([key, values]) => `${key}${values.map((value) => `[${escapeSgfValue(value)}]`).join('')}`).join('');
  return `(;${props}${moves.map((move) => `;${move.color}[${move.point}]`).join('')})`;
}

function setHandicap(root: Properties, size: BoardSize, count: number): void {
  if (!Number.isInteger(count) || count < 0 || count > 9) throw new Error('The game record has an invalid handicap (expected 0–9).');
  if (count < 2) return;
  const points = getHandicapPoints(size, count);
  // Tygem/wBaduk place the third stone at the upper left, unlike the usual
  // lower-right placement. The sets for four or more stones are identical.
  if (count === 3) points[2] = [points[1]![0], points[0]![1]];
  root.HA = [String(count)];
  root.AB = points.map(([x, y]) => coordinate(x, y));
  root.PL = ['W'];
}

const parseInteger = (value: string | undefined): number =>
  value && /^[+-]?\d+$/.test(value) ? Number(value) : NaN;

function dateProperty(value: string): string | null {
  const match = /^(\d{4})[-:]?(\d{2})[-:]?(\d{2})/.exec(value);
  if (!match) return null;
  const iso = `${match[1]}-${match[2]}-${match[3]}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

function gibResult(code: number, margin: number): string | null {
  if (code === 3 || code === 4) return `${code === 3 ? 'B' : 'W'}+R`;
  if (code === 7 || code === 8) return `${code === 7 ? 'B' : 'W'}+T`;
  if ((code === 0 || code === 1) && Number.isFinite(margin) && margin >= 0) return `${code === 0 ? 'B' : 'W'}+${margin / 10}`;
  return null;
}

/** Format interpretation follows the GIB/NGF readers in PySGF and Sabaki. */
export function convertGibToSgf(text: string): string {
  assertSgfImportSize(text);
  const root = properties(19);
  const moves: RecordMove[] = [];
  const headers = new Map<string, string>();
  let setupSeen = false;
  const lines = text.split(/\r\n|\n|\r/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    const header = /^\\\[([A-Z0-9_]+)=([\s\S]*)\\\]$/.exec(line);
    if (header) { headers.set(header[1]!, header[2]!); continue; }
    const tokens = line.split(/\s+/);
    if (tokens[0] === 'INI') {
      if (setupSeen || moves.length) throw new Error(`Unexpected GIB setup on line ${i + 1}.`);
      setHandicap(root, 19, parseInteger(tokens[3]));
      setupSeen = true;
    } else if (tokens[0] === 'STO') {
      const color = tokens[3] === '1' ? 'B' : tokens[3] === '2' ? 'W' : null;
      const x = parseInteger(tokens[4]), y = parseInteger(tokens[5]);
      if (!color || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= 19 || y < 0 || y >= 19) {
        throw new Error(`Invalid GIB move on line ${i + 1}.`);
      }
      moves.push({ color, point: coordinate(x, y) });
    }
  }
  for (const [key, color] of [['GAMEBLACKNAME', 'B'], ['GAMEWHITENAME', 'W']] as const) {
    const value = headers.get(key)?.trim();
    if (!value) continue;
    const ranked = /^(.*?)\s*\(([^()]*)\)$/.exec(value);
    root[`P${color}`] = [ranked?.[1]?.trim() || value];
    if (ranked?.[2]?.trim()) root[`${color}R`] = [ranked[2].trim()];
  }
  const info = headers.get('GAMEINFOMAIN') ?? '';
  const tag = headers.get('GAMETAG') ?? '';
  const number = (source: string, key: string, separator: string): number => {
    const value = new RegExp(`(?:^|,)\\s*${key}${separator}([+-]?\\d+(?:\\.\\d+)?)(?:,|$)`).exec(source)?.[1];
    return value === undefined ? NaN : Number(value);
  };
  const result = gibResult(number(info, 'GRLT', ':'), number(info, 'ZIPSU', ':'))
    ?? gibResult(number(tag, 'W', ''), number(tag, 'Z', ''));
  if (result) root.RE = [result];
  const mainKomi = number(info, 'GONGJE', ':');
  const komi = Number.isFinite(mainKomi) ? mainKomi : number(tag, 'G', '');
  if (Number.isFinite(komi)) root.KM = [String(komi / 10)];
  const date = dateProperty(/(?:^|,)\s*C([^,]+)/.exec(tag)?.[1] ?? '');
  if (date) root.DT = [date];
  return serializeRecord(root, moves);
}

export function convertNgfToSgf(text: string): string {
  assertSgfImportSize(text);
  const lines = text.trim().split(/\r\n|\n|\r/);
  const size = parseInteger(lines[1]?.trim());
  if (!isBoardSize(size)) throw new Error('NGF board size must be 9, 13, or 19.');
  if (lines.length < 11) throw new Error('The NGF header is incomplete.');
  const root = properties(size);
  const handicap = parseInteger(lines[5]?.trim());
  setHandicap(root, size, handicap);
  const rawKomi = lines[7]?.trim() ?? '';
  let komi = /^[+-]?\d+(?:\.\d+)?$/.test(rawKomi) ? Number(rawKomi) : NaN;
  if (!Number.isFinite(komi)) throw new Error('The NGF komi is invalid.');
  // NGF omits the half point in even games when its komi is an integer.
  // Preserve explicit fractions and zero komi in handicap games.
  if (handicap === 0 && Number.isInteger(komi)) komi += 0.5;
  root.KM = [String(komi)];
  for (const [index, color] of [[2, 'W'], [3, 'B']] as const) {
    const value = lines[index]!.trim();
    const ranked = /^(.*?)\s+(\d+)(DP|D|K)(\*?)$/i.exec(value);
    if (value) root[`P${color}`] = [ranked?.[1]?.trim() || value];
    if (ranked) root[`${color}R`] = [`${ranked[2]}${ranked[3]!.toUpperCase() === 'DP' ? 'p' : ranked[3]!.toLowerCase()}${ranked[4]}`];
  }
  const date = dateProperty(lines[8]!.trim());
  if (date) root.DT = [date];
  const result = lines[10]!.trim().toLowerCase();
  const black = /black\s+win|white\s+lose/.test(result);
  const white = /white\s+win|black\s+lose/.test(result);
  if (black !== white) {
    const margin = /resign/.test(result) ? 'R' : /time/.test(result) ? 'T' : /\b\d+(?:\.\d+)?\b/.exec(result)?.[0] ?? '';
    root.RE = [`${black ? 'B' : 'W'}+${margin}`];
  } else if (/\bdraw\b|\bjigo\b/.test(result)) root.RE = ['0'];
  const moves: RecordMove[] = [];
  for (let i = 11; i < lines.length; i++) {
    const line = lines[i]!.trim().toUpperCase();
    if (!line.startsWith('PM')) continue;
    const color = line[4];
    const raw = line.slice(5, 7);
    const x = raw.charCodeAt(0) - 66, y = raw.charCodeAt(1) - 66;
    if ((color !== 'B' && color !== 'W') || (raw !== 'AA' && !(x >= 0 && x < size && y >= 0 && y < size))) {
      throw new Error(`Invalid NGF move on line ${i + 1}.`);
    }
    moves.push({ color, point: raw === 'AA' ? '' : coordinate(x, y) });
  }
  return serializeRecord(root, moves);
}

function decodeLegacyText(bytes: Uint8Array, encoding: LegacyGameEncoding): string {
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 'utf-8'
    : bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le'
      : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : null;
  const candidates = bom ? [bom] : encoding === 'auto' ? ['utf-8', 'euc-kr'] : [encoding];
  for (const candidate of candidates) {
    try { return new TextDecoder(candidate, { fatal: true }).decode(bytes); } catch { /* try the next encoding */ }
  }
  throw new Error('Could not decode the game text. Choose its language under Settings → General → GIB / NGF encoding.');
}

/** Convert legacy game formats to the same Unicode SGF used by all import paths. */
export function decodeGameRecordBytes(bytes: Uint8Array, format: GameRecordFormat, encoding: LegacyGameEncoding = 'auto'): string {
  assertSgfImportSize(bytes.byteLength);
  if (format === 'sgf') return decodeSgfBytes(bytes);
  const text = decodeLegacyText(bytes, isLegacyGameEncoding(encoding) ? encoding : 'auto');
  return format === 'gib' ? convertGibToSgf(text) : convertNgfToSgf(text);
}

export async function readGameRecordFile(file: Blob & { name: string }, encoding: LegacyGameEncoding = 'auto'): Promise<string> {
  assertSgfImportSize(file.size);
  const format = gameRecordFormat(file.name) ?? (file.type === 'application/x-go-sgf' ? 'sgf' : null);
  if (!format) throw new Error('Choose an SGF, GIB, or NGF game record.');
  return decodeGameRecordBytes(new Uint8Array(await file.arrayBuffer()), format, encoding);
}
