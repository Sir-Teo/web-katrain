import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parseKataGoModelV8 } from '../src/engine/katago/loadModelV8';

// The human SL net is a ~99MB download, so this only runs when it has been fetched
// into .external (see docs). It is the only net that exercises the meta encoder.
const HUMAN_MODEL = path.resolve(__dirname, '../.external/katago-human-model.bin.gz');

describe.skipIf(!fs.existsSync(HUMAN_MODEL))('human SL model parsing', () => {
  it('parses the metadata encoder', () => {
    const raw = zlib.gunzipSync(fs.readFileSync(HUMAN_MODEL));
    const parsed = parseKataGoModelV8(new Uint8Array(raw));
    expect(parsed.metaEncoderVersion).toBe(1);
    expect(parsed.metaEncoder).toBeDefined();
    expect(parsed.metaEncoder!.numInputMetaChannels).toBe(192);
    expect(parsed.metaEncoder!.mul1.inChannels).toBe(192);
    expect(parsed.metaEncoder!.mul3.outChannels).toBe(parsed.trunk.trunkNumChannels);
    expect(parsed.numInputChannels).toBe(22);
    expect(parsed.numInputGlobalChannels).toBe(19);
    // The human net also carries the shortterm error heads that uncertainty needs.
    expect(parsed.scoreValueChannels).toBeGreaterThanOrEqual(6);
  }, 300000);
});
