import { describe, expect, it, vi } from 'vitest';
import { printWindow } from '../src/utils/print';

describe('print helpers', () => {
  it('runs the print function when available', () => {
    const target = { print: vi.fn() };

    expect(printWindow(target)).toBe(true);
    expect(target.print).toHaveBeenCalledTimes(1);
  });

  it('returns false when printing is unavailable or blocked', () => {
    expect(printWindow(null)).toBe(false);
    expect(printWindow({})).toBe(false);
    expect(printWindow({ print: () => { throw new Error('print blocked'); } })).toBe(false);
  });
});
