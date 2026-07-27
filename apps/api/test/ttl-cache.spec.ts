import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('force still coalesces concurrent loaders for the same key', async () => {
    const cache = new TtlCache(60_000);
    cache.set('k', 'stale');
    let loads = 0;
    const loader = vi.fn(async () => {
      loads += 1;
      await new Promise((r) => setTimeout(r, 30));
      return `fresh-${loads}`;
    });

    const [a, b, c] = await Promise.all([
      cache.getOrLoad('k', true, loader),
      cache.getOrLoad('k', true, loader),
      cache.getOrLoad('k', true, loader)
    ]);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(a).toBe('fresh-1');
    expect(b).toBe('fresh-1');
    expect(c).toBe('fresh-1');
    expect(cache.get('k')).toBe('fresh-1');
  });

  describe('TTL expiry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns null and deletes the entry once expiresAt is past', () => {
      const cache = new TtlCache(5 * 60 * 1000);
      cache.set('k', 'v');
      expect(cache.get('k')).toBe('v');

      vi.advanceTimersByTime(5 * 60 * 1000);
      // expiresAt is Date.now()+ttl; advance exactly ttl keeps equality off the < check
      expect(cache.get('k')).toBe('v');

      vi.advanceTimersByTime(1);
      expect(cache.get('k')).toBeNull();
      // Second get must still miss (entry was deleted on expiry)
      expect(cache.get('k')).toBeNull();
    });
  });

  describe('max-size LRU eviction', () => {
    it('evicts least-recently-used keys when maxSize is exceeded', () => {
      const cache = new TtlCache(60_000, 2);
      cache.set('a', 1);
      cache.set('b', 2);
      // Touch 'a' so 'b' becomes the LRU victim.
      expect(cache.get('a')).toBe(1);
      cache.set('c', 3);
      expect(cache.get('b')).toBeNull();
      expect(cache.get('a')).toBe(1);
      expect(cache.get('c')).toBe(3);
      expect(cache.size).toBe(2);
    });

    it('drops expired entries before LRU eviction', () => {
      vi.useFakeTimers();
      const cache = new TtlCache(1_000, 2);
      cache.set('old', 1);
      vi.advanceTimersByTime(1_001);
      cache.set('fresh1', 2);
      cache.set('fresh2', 3);
      // 'old' expired and was purged; both fresh keys fit.
      expect(cache.get('old')).toBeNull();
      expect(cache.get('fresh1')).toBe(2);
      expect(cache.get('fresh2')).toBe(3);
      vi.useRealTimers();
    });
  });

  describe('prefix-scoped clear', () => {
    it('deletes only matching store keys and matching inFlight entries', async () => {
      const cache = new TtlCache(60_000);
      cache.set('gmv:day:2026-07-01', 1);
      cache.set('gmv:day:2026-07-02', 2);
      cache.set('refund:day:2026-07-01', 3);

      // Seed inFlight with a slow load under the gmv: prefix and a sibling under refund:
      let release!: () => void;
      const gate = new Promise<void>((r) => {
        release = r;
      });
      const gmvLoad = cache.getOrLoad('gmv:day:pending', false, async () => {
        await gate;
        return 99;
      });
      const refundLoad = cache.getOrLoad('refund:day:pending', false, async () => {
        await gate;
        return 88;
      });
      // Give the loaders a tick so they park in inFlight
      await Promise.resolve();

      cache.clear('gmv:');

      expect(cache.get('gmv:day:2026-07-01')).toBeNull();
      expect(cache.get('gmv:day:2026-07-02')).toBeNull();
      expect(cache.get('refund:day:2026-07-01')).toBe(3);

      // Matching inFlight was dropped; a fresh getOrLoad must start a new load
      const reloader = vi.fn(async () => 100);
      const reloaded = await cache.getOrLoad('gmv:day:pending', false, reloader);
      expect(reloader).toHaveBeenCalledTimes(1);
      expect(reloaded).toBe(100);

      // Non-matching inFlight still resolves its original loader
      release();
      await expect(refundLoad).resolves.toBe(88);
      // The orphaned gmv load must not crash; it may still resolve to 99 after clear
      await expect(gmvLoad).resolves.toBe(99);
    });

    it('clears the entire store and inFlight when no prefix is given', () => {
      const cache = new TtlCache(60_000);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.clear();
      expect(cache.get('a')).toBeNull();
      expect(cache.get('b')).toBeNull();
    });
  });
});
