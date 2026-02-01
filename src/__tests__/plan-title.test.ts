import { describe, it, expect } from 'vitest';
import { formatAge } from '@/lib/plan-title';

describe('formatAge', () => {
  it('returns age with suffix for valid age', () => {
    expect(formatAge(25)).toBe('25岁');
  });

  it('returns unknown for null age', () => {
    expect(formatAge(null)).toBe('未知年龄');
  });

  it('returns unknown for zero or negative age', () => {
    expect(formatAge(0)).toBe('未知年龄');
    expect(formatAge(-5)).toBe('未知年龄');
  });
});
