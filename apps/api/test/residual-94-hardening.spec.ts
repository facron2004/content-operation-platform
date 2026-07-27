import { describe, expect, it } from 'vitest';

describe('residual #94 merchant geocoder bulk CASE UPDATE', () => {
  it('flushGeocodeHits uses CASE UPDATE (not N serial single-row UPDATEs)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant', 'merchant-geocoder.ts'),
      'utf8'
    );

    expect(src).toContain('flushGeocodeHits');
    expect(src).toContain('GEOCODE_WRITE_CHUNK');
    expect(src).toMatch(/CASE\s+"merchantId"/);
    expect(src).toContain('WHEN ? THEN ?');
    // Crawl loop must not await single-row UPDATE per merchant.
    expect(src).not.toMatch(
      /UPDATE\s+"Merchant"\s+SET\s+"lat"\s*=\s*\?\s*,\s*"lng"\s*=\s*\?\s*,\s*"lastSeenAt"\s*=\s*\?\s+WHERE\s+"merchantId"\s*=\s*\?/
    );
  });

  it('geocode accumulates pending hits and flushes after crawl', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant', 'merchant-geocoder.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async function geocodeMerchantsFromPartnerShopUnlocked');
    expect(fnStart).toBeGreaterThan(0);
    const fn = src.slice(fnStart);
    expect(fn).toContain('pending.push');
    expect(fn).toContain('flushGeocodeHits');
    // Network rate limit preserved.
    expect(fn).toContain('sleep(200)');
  });
});
