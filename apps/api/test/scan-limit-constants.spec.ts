import { describe, expect, it, vi } from 'vitest';
import {
  ATTRIBUTION_MISMATCH_PURGE_LIMIT,
  MERCHANT_GEOCODE_BATCH_LIMIT,
  MERCHANT_UPSERT_SCAN_LIMIT,
  PLATFORM_SCAN_LIMIT,
  RESOLVED_ALERT_DAY_LIMIT
} from '../src/common/sql-chunk';
import { geocodeMerchantsFromPartnerShop } from '../src/merchant/merchant-geocoder';
import { upsertMerchants } from '../src/merchant/merchant-address-updater';
import { AttributionService } from '../src/attribution/attribution.service';
import { AlertService } from '../src/content/alert.service';

describe('named platform scan ceilings (residual #53)', () => {
  it('exports merchant/attribution/alert ceilings under PLATFORM_SCAN', () => {
    expect(MERCHANT_GEOCODE_BATCH_LIMIT).toBe(2_000);
    expect(MERCHANT_UPSERT_SCAN_LIMIT).toBe(5_000);
    expect(ATTRIBUTION_MISMATCH_PURGE_LIMIT).toBe(5_000);
    expect(RESOLVED_ALERT_DAY_LIMIT).toBe(5_000);
    expect(MERCHANT_GEOCODE_BATCH_LIMIT).toBeLessThan(PLATFORM_SCAN_LIMIT);
    expect(MERCHANT_UPSERT_SCAN_LIMIT).toBeLessThanOrEqual(PLATFORM_SCAN_LIMIT);
  });

  it('geocoder and merchant refresh bind their runtime query caps', async () => {
    const geocodePrisma = { $queryRawUnsafe: vi.fn().mockResolvedValue([]) };
    await geocodeMerchantsFromPartnerShop(
      geocodePrisma as never,
      undefined as never,
      undefined as never
    );
    expect(String(geocodePrisma.$queryRawUnsafe.mock.calls[0][0])).toContain(
      `LIMIT ${MERCHANT_GEOCODE_BATCH_LIMIT}`
    );

    const addressPrisma = { $queryRawUnsafe: vi.fn().mockResolvedValue([]) };
    await upsertMerchants(addressPrisma as never);
    expect(String(addressPrisma.$queryRawUnsafe.mock.calls[0][0])).toContain(
      `LIMIT ${MERCHANT_UPSERT_SCAN_LIMIT}`
    );
  });

  it('attribution purge binds the mismatch cap at execution time', async () => {
    const prisma = { $queryRawUnsafe: vi.fn().mockResolvedValue([]) };
    const service = new AttributionService(prisma as never);

    await expect(service.recompute()).resolves.toMatchObject({
      success: true,
      processedTasks: 0
    });
    expect(prisma.$queryRawUnsafe.mock.calls[0].at(-1)).toBe(ATTRIBUTION_MISMATCH_PURGE_LIMIT);
  });

  it('resolved alert loading requests only one bounded head plus truncation probe', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new AlertService({ operationAlertResolution: { findMany } } as never);

    await expect(service.loadResolvedAlertIds('2026-08-03')).resolves.toMatchObject({
      loaded: 0,
      truncated: false,
      limit: RESOLVED_ALERT_DAY_LIMIT
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: RESOLVED_ALERT_DAY_LIMIT + 1 })
    );
  });
});
