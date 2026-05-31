import { describe, expect, it } from 'vitest';
import { isNoteBulletLine, parseNoteInlinePreview } from '../src/utils/notePreview';

describe('note preview helpers', () => {
  it('parses compact markdown-style inline note segments', () => {
    expect(parseNoteInlinePreview('Try **urgent** at `D4`: https://example.com.')).toEqual([
      { type: 'text', text: 'Try ' },
      { type: 'strong', text: 'urgent' },
      { type: 'text', text: ' at ' },
      { type: 'code', text: 'D4' },
      { type: 'text', text: ': ' },
      { type: 'link', text: 'https://example.com', href: 'https://example.com' },
      { type: 'text', text: '.' },
    ]);
  });

  it('parses labeled https links and bullet lines', () => {
    expect(parseNoteInlinePreview('Review [shape](https://example.com/shape) next')).toEqual([
      { type: 'text', text: 'Review ' },
      { type: 'link', text: 'shape', href: 'https://example.com/shape' },
      { type: 'text', text: ' next' },
    ]);

    expect(isNoteBulletLine('- sente')).toEqual({ text: 'sente' });
    expect(isNoteBulletLine('plain note')).toBeNull();
  });
});
