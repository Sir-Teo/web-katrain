import { describe, expect, it } from 'vitest';
import { looksLikeMarkup, modelResponseError } from '../src/engine/katago/modelResponse';

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new TextEncoder().encode(text);

describe('model response sniffing', () => {
  it('recognises the index.html a single-page host serves for an unknown path', () => {
    expect(looksLikeMarkup(ascii('<!DOCTYPE html><html>'))).toBe(true);
    expect(looksLikeMarkup(ascii('<html lang="en">'))).toBe(true);
    // Hosts vary: leading whitespace and a UTF-8 BOM are both common.
    expect(looksLikeMarkup(ascii('\n\n  <!doctype html>'))).toBe(true);
    expect(looksLikeMarkup(bytes(0xef, 0xbb, 0xbf, 0x3c, 0x68, 0x74))).toBe(true);
  });

  it('passes real model payloads through', () => {
    // The bundled model is gzipped: 0x1f 0x8b.
    expect(looksLikeMarkup(bytes(0x1f, 0x8b, 0x08, 0x00))).toBe(false);
    // An uncompressed model starts with its own text header, not markup.
    expect(looksLikeMarkup(ascii('kata1-b18c384nbt\n'))).toBe(false);
    expect(looksLikeMarkup(bytes())).toBe(false);
  });

  it('names the URL and the fix rather than leaking a parser error', () => {
    const message = modelResponseError('/models/typo.bin.gz').message;

    // The old failure surfaced as "Invalid int token: html>" from deep inside
    // the weight parser, which told the reader nothing they could act on.
    expect(message).toContain('/models/typo.bin.gz');
    expect(message).toContain('Settings');
    expect(message).not.toContain('int token');
  });
});
