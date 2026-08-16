import { describe, expect, it } from 'vitest';
import { isNoteBulletLine, parseNoteBlockLine, parseNoteBlocks, parseNoteInlinePreview } from '../src/utils/notePreview';

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

  it('parses markdown-style block notes', () => {
    expect(parseNoteBlockLine('# Attack shape')).toEqual({ type: 'heading', level: 1, text: 'Attack shape' });
    expect(parseNoteBlockLine('> White is thin')).toEqual({ type: 'quote', text: 'White is thin' });
    expect(parseNoteBlockLine('2. Hane first')).toEqual({ type: 'ordered', number: '2', text: 'Hane first' });
    expect(parseNoteBlockLine('- [x] Sente threat')).toEqual({ type: 'task', checked: true, text: 'Sente threat' });
    expect(parseNoteBlockLine('- [ ] Follow-up')).toEqual({ type: 'task', checked: false, text: 'Follow-up' });
  });

  it('preserves blank note blocks for preview spacing', () => {
    expect(parseNoteBlocks('First\n\n- second')).toEqual([
      { type: 'paragraph', text: 'First' },
      { type: 'blank' },
      { type: 'bullet', text: 'second' },
    ]);
  });

  it('groups fenced code blocks without parsing their contents as markdown', () => {
    expect(parseNoteBlocks('Before\n```sgf\n(;B[pd];W[dd])\n# not a heading\n```\nAfter')).toEqual([
      { type: 'paragraph', text: 'Before' },
      { type: 'code', language: 'sgf', text: '(;B[pd];W[dd])\n# not a heading' },
      { type: 'paragraph', text: 'After' },
    ]);
  });

  it('parses compact GFM-style tables', () => {
    expect(parseNoteBlocks('| Plan | Follow-up | Winrate |\n| :--- | :---: | ---: |\n| Attach | hane | **52%** |\n| Tenuki | clamp | 48% |')).toEqual([
      {
        type: 'table',
        headers: ['Plan', 'Follow-up', 'Winrate'],
        alignments: ['left', 'center', 'right'],
        rows: [
          ['Attach', 'hane', '**52%**'],
          ['Tenuki', 'clamp', '48%'],
        ],
      },
    ]);
  });

  it('accepts GFM delimiter rows with one or more dashes per cell', () => {
    expect(parseNoteBlocks('| A | B |\n| - | - |\n| 1 | 2 |')).toEqual([
      { type: 'table', headers: ['A', 'B'], alignments: ['left', 'left'], rows: [['1', '2']] },
    ]);
    expect(parseNoteBlocks('A | B\n-- | --\n1 | 2')).toEqual([
      { type: 'table', headers: ['A', 'B'], alignments: ['left', 'left'], rows: [['1', '2']] },
    ]);
    expect(parseNoteBlocks('| A | B |\n| :-: | -: |\n| 1 | 2 |')).toEqual([
      { type: 'table', headers: ['A', 'B'], alignments: ['center', 'right'], rows: [['1', '2']] },
    ]);
  });

  it('keeps escaped pipes inside table cells', () => {
    expect(parseNoteBlocks('| A \\| B | C |\n| --- | --- |\n| x \\| y | z |')).toEqual([
      { type: 'table', headers: ['A | B', 'C'], alignments: ['left', 'left'], rows: [['x | y', 'z']] },
    ]);
  });

  it('pads short body rows instead of breaking out of the table', () => {
    expect(parseNoteBlocks('| A | B | C |\n| --- | --- | --- |\n| 1 |\n| 2 | 3 | 4 |')).toEqual([
      { type: 'table', headers: ['A', 'B', 'C'], alignments: ['left', 'left', 'left'], rows: [['1', '', ''], ['2', '3', '4']] },
    ]);
  });

  it('does not let other block types become table headers or body rows', () => {
    expect(parseNoteBlocks('# Title | X\n| --- | --- |\n| 1 | 2 |')).toEqual([
      { type: 'heading', level: 1, text: 'Title | X' },
      { type: 'paragraph', text: '| --- | --- |' },
      { type: 'paragraph', text: '| 1 | 2 |' },
    ]);
    expect(parseNoteBlocks('| A | B |\n| --- | --- |\n- bullet | x\n| 1 | 2 |')).toEqual([
      { type: 'table', headers: ['A', 'B'], alignments: ['left', 'left'], rows: [] },
      { type: 'bullet', text: 'bullet | x' },
      { type: 'paragraph', text: '| 1 | 2 |' },
    ]);
  });

  it('parses single-column tables and blank-line-separated adjacent tables', () => {
    expect(parseNoteBlocks('| A |\n| --- |\n| 1 |')).toEqual([
      { type: 'table', headers: ['A'], alignments: ['left'], rows: [['1']] },
    ]);
    expect(parseNoteBlocks('| A | B |\n| --- | --- |\n| 1 | 2 |\n\n| C | D |\n| --- | --- |\n| 3 | 4 |')).toEqual([
      { type: 'table', headers: ['A', 'B'], alignments: ['left', 'left'], rows: [['1', '2']] },
      { type: 'blank' },
      { type: 'table', headers: ['C', 'D'], alignments: ['left', 'left'], rows: [['3', '4']] },
    ]);
  });
});
