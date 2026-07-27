import { describe, expect, it } from 'vitest';
import { safePathId } from '../src/common/path-id';

describe('safePathId', () => {
  it('trims and caps at default 64', () => {
    expect(safePathId('  abc  ')).toBe('abc');
    expect(safePathId('x'.repeat(100))).toHaveLength(64);
  });

  it('honors custom maxLen', () => {
    expect(safePathId('hello-world', 5)).toBe('hello');
  });

  it('returns empty for non-string / blank', () => {
    expect(safePathId(undefined)).toBe('');
    expect(safePathId(null)).toBe('');
    expect(safePathId(42)).toBe('');
    expect(safePathId('   ')).toBe('');
  });
});
