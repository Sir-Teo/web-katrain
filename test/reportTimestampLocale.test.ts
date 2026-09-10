import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatReportTimestamp } from '../src/utils/gameReport';

// 2026-09-09 17:23 local time, whatever the runner's zone is: the assertions
// below read the formatted output, never a fixed UTC offset.
const GENERATED_AT = new Date(2026, 8, 9, 17, 23);

describe('printed report timestamp', () => {
  it('follows the reader\'s locale rather than a pinned one', () => {
    // A German reader writes the day first and keeps a 24-hour clock. The old
    // 'en-US' argument gave them "Sep 9, 2026 · 05:23 PM" on a page they print.
    const german = formatReportTimestamp(GENERATED_AT, 'de-DE');

    expect(german).toContain('17:23');
    expect(german).not.toMatch(/AM|PM/);
    expect(german.indexOf('9')).toBeLessThan(german.indexOf('2026'));
  });

  it('still reads as a US date for a US reader', () => {
    expect(formatReportTimestamp(GENERATED_AT, 'en-US')).toBe('Sep 9, 2026 · 05:23 PM');
  });

  it('keeps the minute precision the library and save status use', () => {
    // Seconds wrapped the line in the library list and were dropped there; the
    // report cover sits in the same family and should not reintroduce them.
    expect(formatReportTimestamp(GENERATED_AT, 'en-US')).not.toMatch(/:\d\d:\d\d/);
  });

  it('leaves no pinned locale in the report component', () => {
    const source = readFileSync('src/components/GameReportModal.tsx', 'utf8');

    expect(source).not.toContain("toLocaleDateString('en-US'");
    expect(source).not.toContain("toLocaleTimeString('en-US'");
    expect(source).toContain('formatReportTimestamp(generatedAt)');
  });
});
