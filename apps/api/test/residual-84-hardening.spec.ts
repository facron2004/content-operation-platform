import { describe, expect, it, vi } from 'vitest';
import { DetailCache } from '../src/content/package-detail/detail-cache';
import type { PackageDetail } from '../src/content/package-detail/types';

const makeDetail = (overrides: Partial<PackageDetail> = {}): PackageDetail => ({
  packageId: 'pkg-1',
  packageTitle: 'Test Package',
  sections: [],
  fetchedAt: new Date(),
  ...overrides
});

describe('residual #84 DetailCache force keep-inFlight', () => {
  it('remove drops warm value only — concurrent getOrLoad still shares the flight', async () => {
    const cache = new DetailCache();
    const detail = makeDetail({ packageId: 'pkg-1' });
    let resolveLoader!: (v: PackageDetail) => void;
    const loader = vi.fn(
      () =>
        new Promise<PackageDetail>((resolve) => {
          resolveLoader = resolve;
        })
    );

    const first = cache.getOrLoad('pkg-1', loader);
    // Force-refresh semantics: drop warm entry mid-flight (none warm yet).
    cache.remove('pkg-1');
    const second = cache.getOrLoad('pkg-1', loader);

    resolveLoader(detail);
    const [a, b] = await Promise.all([first, second]);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(a).toEqual(detail);
    expect(b).toEqual(detail);
    // Flight settles into warm cache after remove+join.
    expect(cache.get('pkg-1')).toEqual(detail);
  });

  it('remove after warm set still allows a single re-fetch flight', async () => {
    const cache = new DetailCache();
    cache.set('pkg-1', makeDetail({ packageTitle: 'stale' }));
    cache.remove('pkg-1');
    expect(cache.get('pkg-1')).toBeNull();

    const fresh = makeDetail({ packageTitle: 'fresh' });
    const loader = vi.fn(async () => fresh);
    const [a, b] = await Promise.all([
      cache.getOrLoad('pkg-1', loader),
      cache.getOrLoad('pkg-1', loader)
    ]);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(a).toEqual(fresh);
    expect(b).toEqual(fresh);
  });
});

describe('residual #84 DataSourceService forceInFlight coalesce', () => {
  it('source tracks forceInFlight and startLoad (not only bare inFlight)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'data-source.service.ts'),
      'utf8'
    );
    expect(src).toContain('forceInFlight');
    expect(src).toContain('startLoad');
    // Concurrent forces join forceInFlight; non-force joins any inFlight.
    expect(src).toMatch(/if \(this\.forceInFlight\) return this\.forceInFlight/);
    expect(src).toMatch(/if \(this\.inFlight\) return this\.inFlight/);
    // Force waiters re-check forceInFlight after awaiting a non-force flight.
    expect(src).toMatch(
      /await this\.inFlight[\s\S]*?if \(this\.forceInFlight\) return this\.forceInFlight/
    );
  });
});

describe('residual #84 Soldout absolute + force coalesce', () => {
  it('absolute and relative slots both single-flight with force coalescers', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'soldout.service.ts'),
      'utf8'
    );
    expect(src).toContain('absoluteInFlight');
    expect(src).toContain('relativeInFlight');
    expect(src).toContain('absoluteForceInFlight');
    expect(src).toContain('relativeForceInFlight');
    expect(src).toContain('startCollect');
    // Absolute path no longer skips the coalescer entirely.
    expect(src).not.toMatch(/if \(!wantAbsolute\) this\.inFlight/);
    expect(src).not.toMatch(/private inFlight: Promise<SoldoutCollectResult>/);
  });
});

describe('residual #84 AutoLogin validateInFlight', () => {
  it('validateCookie coalesces concurrent checks and shares TTL with getCookieStatus', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'auto-login.service.ts'),
      'utf8'
    );
    expect(src).toContain('validateInFlight');
    expect(src).toContain('validateInFlightCookie');
    expect(src).toMatch(/validateInFlight && this\.validateInFlightCookie === cookie/);
    // getCookieStatus no longer reimplements TTL; validateCookie owns it.
    const statusStart = src.indexOf('async getCookieStatus(');
    expect(statusStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async ', statusStart + 10);
    const statusFn = src.slice(statusStart, next > 0 ? next : undefined);
    expect(statusFn).toContain('validateCookie');
    expect(statusFn).not.toMatch(/lastValidateAt < COOKIE_STATUS_CACHE_MS/);
  });
});
