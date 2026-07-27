import { describe, expect, it } from 'vitest';
import { recommendationCacheKey } from '../src/content/content-recommendation-runtime';

describe('recommendationCacheKey', () => {
  it('separates multi-scope areaIds so operators do not share cache', () => {
    const a = recommendationCacheKey({ areaIds: ['A2', 'A1'], status: 'selling' });
    const b = recommendationCacheKey({ areaIds: ['A3', 'A4'], status: 'selling' });
    const c = recommendationCacheKey({ status: 'selling' });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(b).not.toBe(c);
  });

  it('is stable under areaIds order and duplicates', () => {
    const a = recommendationCacheKey({ areaIds: ['A2', 'A1', 'A1'], merchantIds: ['M1'] });
    const b = recommendationCacheKey({ areaIds: ['A1', 'A2'], merchantIds: ['M1'] });
    expect(a).toBe(b);
    expect(a).toContain('A1,A2');
  });
});
