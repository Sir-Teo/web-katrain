import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * docs/parity.md exists because the checks drifted apart three times without
 * anyone noticing -- and then it drifted itself: it recorded the browser suite
 * as running in `ci.yml` while the step in `ci.yml` was commented out, so the
 * page written to catch this was asserting the opposite of the truth.
 *
 * Nothing else reads the two side by side. A workflow with a step commented out
 * is valid YAML, and a table saying "yes" is valid prose.
 */
const root = path.resolve(__dirname, '..');
const ci = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
const parity = fs.readFileSync(path.join(root, 'docs', 'parity.md'), 'utf8');

/** Lines a workflow will actually run: a `#` step is documentation. */
const liveCiLines = ci.split('\n').filter((line) => !line.trim().startsWith('#'));
const ciRunsViewport = liveCiLines.some((line) => line.includes('npm run test:viewport'));

function tableCells(rowPrefix: string): string[] {
  const line = parity.split('\n').find((candidate) => candidate.startsWith(rowPrefix));
  expect(line, `docs/parity.md no longer has a row starting "${rowPrefix}"`).toBeTruthy();
  return line!.split('|').slice(1, -1).map((cell) => cell.trim());
}

describe('parity.md agrees with ci.yml about the browser suite', () => {
  it('still describes the suite in both tables', () => {
    expect(parity).toContain('| browser suite (`test:viewport`) |');
    expect(parity).toContain('| Where the browser suite runs |');
  });

  it('says yes for ci.yml only when ci.yml actually runs it', () => {
    // Cells: check | verify | ci.yml | deploy.
    const ciCell = tableCells('| browser suite (`test:viewport`) |')[2]!;
    const claimsYes = /\byes\b/i.test(ciCell) && !/\bno\b/i.test(ciCell);
    expect(
      claimsYes,
      `parity.md says "${ciCell}" for ci.yml, but ci.yml ${ciRunsViewport ? 'does' : 'does not'} run it`
    ).toBe(ciRunsViewport);
  });

  it('keeps the cross-repo row honest about this repo too', () => {
    // Cells: label | web-chess | web-katrain | web-xiangqi.
    const katrain = tableCells('| Where the browser suite runs |')[2]!;
    const claimsCi = katrain.includes('ci.yml') && !/commented out|local only/i.test(katrain);
    expect(
      claimsCi,
      `parity.md says "${katrain}" for web-katrain, but ci.yml ${ciRunsViewport ? 'does' : 'does not'} run it`
    ).toBe(ciRunsViewport);
  });

  it('keeps the browser gate and its slower-CPU diagnostic discoverable', () => {
    expect(ci).toContain('npm run test:viewport');
    expect(parity).toContain('VIEWPORT_CPU_THROTTLE=6');
  });
});
