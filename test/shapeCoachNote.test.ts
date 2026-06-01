import { describe, expect, it } from 'vitest';
import { appendShapeCoachNoteBlock, formatShapeCoachNoteBlock } from '../src/utils/shapeCoachNote';

describe('shape coach notes', () => {
  const block = formatShapeCoachNoteBlock(
    {
      label: 'Attachment',
      detail: 'Touches an opposing stone directly.',
      tone: 'tactical',
      learnMoreUrl: 'https://senseis.xmp.net/?Attachment',
    },
    {
      beginner: 'An attachment touches an opposing stone.',
      pro: 'Check hane, extend, and crosscut.',
      checks: ['Hane', 'Extend', 'Crosscut'],
    }
  );

  it('formats coach guidance as a compact markdown note block', () => {
    expect(block).toBe(
      [
        '### Shape coach: Attachment',
        '- Beginner: An attachment touches an opposing stone.',
        '- Pro: Check hane, extend, and crosscut.',
        '- Checks: Hane, Extend, Crosscut',
        '- Learn: [Attachment](https://senseis.xmp.net/?Attachment)',
      ].join('\n')
    );
  });

  it('appends coach guidance without duplicating it', () => {
    expect(appendShapeCoachNoteBlock('', block)).toBe(block);
    expect(appendShapeCoachNoteBlock('Opening idea\n', block)).toBe(`Opening idea\n\n${block}`);
    expect(appendShapeCoachNoteBlock(`Opening idea\n\n${block}`, block)).toBe(`Opening idea\n\n${block}`);
  });
});
