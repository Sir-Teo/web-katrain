import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PasteSgfModal } from '../src/components/PasteSgfModal';
import { getPasteSgfInputInfo } from '../src/utils/pasteSgfInput';

describe('PasteSgfModal', () => {
  it('explains supported SGF and OGS inputs in the empty state', () => {
    const html = renderToStaticMarkup(
      <PasteSgfModal onClose={() => undefined} onSubmit={async () => 'loaded'} />,
    );

    expect(html).toContain('SGF text or OGS game URL');
    expect(html).toContain('data-paste-sgf-input-kind="empty"');
    expect(html).toContain('Paste raw SGF text or an Online-Go game URL');
    expect(html).toContain('https://online-go.com/game/12345');
  });

  it('detects OGS game links and shows the exact game being downloaded', () => {
    const info = getPasteSgfInputInfo('https://online-go.com/game/81344851');

    expect(info.kind).toBe('ogs');
    expect(info.gameId).toBe('81344851');
    expect(info.helper).toContain('Detected OGS game 81344851');
    expect(info.submitStatus).toBe('Downloading OGS game 81344851...');
    expect(info.errorStatus).toContain('game is public');
  });

  it('separates direct SGF from unsupported URLs', () => {
    expect(getPasteSgfInputInfo('(;GM[1]FF[4])').kind).toBe('sgf');

    const urlInfo = getPasteSgfInputInfo('https://example.com/game/123');
    expect(urlInfo.kind).toBe('url');
    expect(urlInfo.helper).toContain('Only Online-Go game links are downloaded');
    expect(urlInfo.errorStatus).toContain('Paste raw SGF text');
  });
});
