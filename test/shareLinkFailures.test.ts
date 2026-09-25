import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildShareUrl, decodeSgfFromFragment, decodeSgfFromShareUrl, hasSgfFragment } from '../src/utils/shareLink';
import { loadSgfOrOgs } from '../src/utils/ogs';

const SGF = '(;GM[1]FF[4]SZ[9]PB[Shared Black]C[héllo 🌟];B[cc];W[gg])';
const url = buildShareUrl(SGF, { origin: 'https://example.test', pathname: '/web-katrain/', search: '' });

describe('share links that cannot be read', () => {
  it('are still recognised as share links, so the app can say so', () => {
    const truncated = new URL(url).hash.slice(0, 20);
    expect(decodeSgfFromFragment(truncated)).toBeNull();
    expect(hasSgfFragment(truncated)).toBe(true);
    expect(hasSgfFragment('#other=1')).toBe(false);
    expect(hasSgfFragment('')).toBe(false);
  });

  it('are reported at startup and on a same-tab hash change', () => {
    const layout = readFileSync('src/components/Layout.tsx', 'utf8');
    expect(layout.match(/toast\(UNREADABLE_SHARE_LINK_MESSAGE, 'error'\)/g)).toHaveLength(2);
    expect(layout).toContain("window.addEventListener('hashchange', onHashChange);");
    // A tab that already holds a game asks before replacing it.
    expect(layout).toMatch(/const onHashChange = \(\) => \{[\s\S]*?await prepareForGameReplacement\(\)/);
  });
});

describe('a share link given as text', () => {
  it('decodes from a pasted or shared URL', () => {
    expect(decodeSgfFromShareUrl(url)).toBe(SGF);
    expect(decodeSgfFromShareUrl(`  ${url}\n`)).toBe(SGF);
    expect(decodeSgfFromShareUrl('not a url #sgf=abc')).toBeNull();
  });

  it('loads through Paste SGF and the share sheet', async () => {
    // It went to the SGF parser as text: "missing game tree".
    await expect(loadSgfOrOgs(url)).resolves.toEqual({ sgf: SGF, source: 'direct' });
  });
});

describe('copying a share link', () => {
  it('leaves the analysis out and refuses a link too long to open', () => {
    const layout = readFileSync('src/components/Layout.tsx', 'utf8');
    const handler = layout.slice(layout.indexOf('const handleCopyShareLink'), layout.indexOf('const handlePasteSgf'));
    expect(handler).toContain('trainer: { ...sgfExportOptions.trainer, saveAnalysis: false }');
    expect(handler).toContain('> MAX_SHARE_FRAGMENT_LENGTH');
  });
});
