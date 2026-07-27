import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ATTRIBUTION_MISMATCH_PURGE_LIMIT,
  MERCHANT_GEOCODE_BATCH_LIMIT,
  MERCHANT_UPSERT_SCAN_LIMIT,
  PLATFORM_SCAN_LIMIT,
  RESOLVED_ALERT_DAY_LIMIT
} from '../src/common/sql-chunk';

describe('named platform scan ceilings (residual #53)', () => {
  it('exports merchant/attribution/alert ceilings under PLATFORM_SCAN', () => {
    expect(MERCHANT_GEOCODE_BATCH_LIMIT).toBe(2_000);
    expect(MERCHANT_UPSERT_SCAN_LIMIT).toBe(5_000);
    expect(ATTRIBUTION_MISMATCH_PURGE_LIMIT).toBe(5_000);
    expect(RESOLVED_ALERT_DAY_LIMIT).toBe(5_000);
    expect(MERCHANT_GEOCODE_BATCH_LIMIT).toBeLessThan(PLATFORM_SCAN_LIMIT);
    expect(MERCHANT_UPSERT_SCAN_LIMIT).toBeLessThanOrEqual(PLATFORM_SCAN_LIMIT);
  });

  it('call sites bind named constants instead of bare magic LIMITs', () => {
    const geo = readFileSync(
      join(__dirname, '..', 'src', 'merchant', 'merchant-geocoder.ts'),
      'utf8'
    );
    const addr = readFileSync(
      join(__dirname, '..', 'src', 'merchant', 'merchant-address-updater.ts'),
      'utf8'
    );
    const attr = readFileSync(
      join(__dirname, '..', 'src', 'attribution', 'attribution.service.ts'),
      'utf8'
    );
    const alert = readFileSync(join(__dirname, '..', 'src', 'content', 'alert.service.ts'), 'utf8');

    expect(geo).toContain('MERCHANT_GEOCODE_BATCH_LIMIT');
    expect(geo).not.toMatch(/LIMIT 2000/);
    expect(addr).toContain('MERCHANT_UPSERT_SCAN_LIMIT');
    expect(addr).not.toMatch(/LIMIT 5000/);
    expect(attr).toContain('ATTRIBUTION_MISMATCH_PURGE_LIMIT');
    // Mismatch purge must use bound param, not bare LIMIT 5000.
    expect(attr).not.toMatch(/OR oh\."packageId" <> t\."packageId"\s*\n\s*LIMIT 5000/);
    expect(alert).toContain('RESOLVED_ALERT_DAY_LIMIT');
    expect(alert).not.toMatch(/const RESOLVED_ALERT_LIMIT = 5000/);
  });
});
