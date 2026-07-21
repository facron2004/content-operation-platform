import { describe, expect, it, vi } from 'vitest';
import { TtlCache } from '../src/common/ttl-cache';

describe('TtlCache', () => {
  it('dedupes concurrent getOrLoad calls for the same key', async () => {
    const cache = new TtlCache(60_000);
    let loads = 0;
    const loader = vi.fn(async () => {
      loads += 1;
      await new Promise((r) => setTimeout(r, 30));
      return { loads };
    });

    const [a, b, c] = await Promise.all([
      cache.getOrLoad('k', false, loader),
      cache.getOrLoad('k', false, loader),
      cache.getOrLoad('k', false, loader)
    ]);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ loads: 1 });
    expect(b).toEqual({ loads: 1 });
    expect(c).toEqual({ loads: 1 });
    expect(cache.get('k')).toEqual({ loads: 1 });
  });

  it('force reloads even when a value is cached', async () => {
    const cache = new TtlCache(60_000);
    cache.set('k', 'old');
    const value = await cache.getOrLoad('k', true, async () => 'new');
    expect(value).toBe('new');
    expect(cache.get('k')).toBe('new');
  });
});
