import { describe, expect, it, vi } from 'vitest';
import { clearCache, cachedGet, getCacheKey } from './cache.service';

describe('getCacheKey', () => {
  it('builds stable key from sorted params', () => {
    const key = getCacheKey('/api/test', { b: 2, a: 1 });
    expect(key).toContain('/api/test');
    expect(key).toContain('"a":1');
    expect(key).toContain('"b":2');
  });

  it('omits null/undefined params', () => {
    const key = getCacheKey('/api/test', { a: 1, b: undefined, c: null });
    expect(key).toContain('"a":1');
    expect(key).not.toContain('b');
    expect(key).not.toContain('c');
  });
});

describe('cachedGet', () => {
  it('caches and returns data', async () => {
    const fetcher = vi.fn().mockResolvedValue({ id: 1 });
    const result = await cachedGet(fetcher, '/api/test');
    expect(result).toEqual({ id: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    // Second call hits cache
    const result2 = await cachedGet(fetcher, '/api/test');
    expect(result2).toEqual({ id: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent requests', async () => {
    const fetcher = vi.fn().mockResolvedValue('data');
    const [a, b] = await Promise.all([
      cachedGet(fetcher, '/api/dedup'),
      cachedGet(fetcher, '/api/dedup')
    ]);
    expect(a).toBe('data');
    expect(b).toBe('data');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('clearCache', () => {
  it('clears all when no pattern given', async () => {
    await cachedGet(vi.fn().mockResolvedValue('a'), '/api/a');
    await cachedGet(vi.fn().mockResolvedValue('b'), '/api/b');
    clearCache();
    const fa = vi.fn().mockResolvedValue('a2');
    const fb = vi.fn().mockResolvedValue('b2');
    await cachedGet(fa, '/api/a');
    await cachedGet(fb, '/api/b');
    expect(fa).toHaveBeenCalled();
    expect(fb).toHaveBeenCalled();
  });

  it('clears matching pattern only', async () => {
    await cachedGet(vi.fn().mockResolvedValue('a'), '/api/a');
    await cachedGet(vi.fn().mockResolvedValue('b'), '/api/b');
    clearCache('/api/a');
    const fa = vi.fn().mockResolvedValue('a2');
    const fb = vi.fn().mockResolvedValue('b2');
    await cachedGet(fa, '/api/a');
    await cachedGet(fb, '/api/b');
    expect(fa).toHaveBeenCalled(); // evicted
    expect(fb).not.toHaveBeenCalled(); // still cached
  });
});
