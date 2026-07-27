import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DailyMetricsRetentionJob } from '../src/jobs/daily-metrics-retention.job';
import {
  DAILY_METRICS_PURGE_BATCH,
  DAILY_METRICS_PURGE_MAX_BATCHES,
  DAILY_METRICS_RETENTION_DAYS
} from '../src/common/sql-chunk';

describe('DailyMetricsRetentionJob', () => {
  const prisma = {
    $executeRawUnsafe: vi.fn()
  };
  let job: DailyMetricsRetentionJob;

  beforeEach(() => {
    vi.clearAllMocks();
    job = new DailyMetricsRetentionJob(prisma as never);
  });

  it('exports retention longer than interactive 90d window', () => {
    expect(DAILY_METRICS_RETENTION_DAYS).toBe(180);
    expect(DAILY_METRICS_RETENTION_DAYS).toBeGreaterThan(90);
    expect(DAILY_METRICS_PURGE_BATCH).toBe(2_000);
    expect(DAILY_METRICS_PURGE_MAX_BATCHES).toBe(25);
  });

  it('purgeOlderThan deletes PSD + MDM + platform DailyMetrics by date', async () => {
    // PSD one batch, MDM one batch, platform single DELETE
    prisma.$executeRawUnsafe
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);

    const result = await job.purgeOlderThan(180, {
      batchSize: 500,
      maxBatches: 5,
      today: '2026-07-23'
    });

    expect(result).toEqual({ packageSales: 7, merchantDaily: 3, platformDaily: 2 });
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(3);

    const [psdSql, psdCutoff, psdLimit] = prisma.$executeRawUnsafe.mock.calls[0];
    expect(String(psdSql)).toContain('DELETE FROM "PackageSalesDaily"');
    expect(String(psdSql)).toContain('"date" < ?');
    expect(String(psdCutoff)).toMatch(/^2026-01-2[34]$/);
    expect(psdLimit).toBe(500);

    const [mdmSql, mdmCutoff, mdmLimit] = prisma.$executeRawUnsafe.mock.calls[1];
    expect(String(mdmSql)).toContain('DELETE FROM "MerchantDailyMetrics"');
    expect(String(mdmSql)).toContain('merchantName');
    expect(String(mdmCutoff)).toMatch(/^2026-01-2[34]$/);
    expect(mdmLimit).toBe(500);

    const [dmSql, dmCutoff] = prisma.$executeRawUnsafe.mock.calls[2];
    expect(String(dmSql)).toContain('DELETE FROM "DailyMetrics"');
    expect(String(dmSql)).toContain('"date" < ?');
    expect(String(dmCutoff)).toMatch(/^2026-01-2[34]$/);
  });

  it('caps each large table at maxBatches and still purges platform once', async () => {
    // PackageSalesDaily: 3 full batches; MerchantDailyMetrics: 3 full batches; platform: 1
    prisma.$executeRawUnsafe.mockResolvedValue(50);

    const result = await job.purgeOlderThan(30, {
      batchSize: 50,
      maxBatches: 3,
      today: '2026-07-23'
    });

    expect(result.packageSales).toBe(150);
    expect(result.merchantDaily).toBe(150);
    expect(result.platformDaily).toBe(50);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(7);
  });

  it('cron entry is overlap-safe', async () => {
    let resolveFirst!: () => void;
    const firstGate = new Promise<void>((r) => {
      resolveFirst = r;
    });
    prisma.$executeRawUnsafe.mockImplementationOnce(async () => {
      await firstGate;
      return 0;
    });

    const first = job.purgeExpiredMetrics();
    await job.purgeExpiredMetrics();
    resolveFirst();
    await first;

    // First run: PSD empty → MDM → platform. Concurrent run skipped.
    expect(prisma.$executeRawUnsafe.mock.calls.length).toBeGreaterThanOrEqual(1);
    const callsAfterFirst = prisma.$executeRawUnsafe.mock.calls.length;
    // One run: at most 3 empty-ish sweeps (PSD/MDM/platform).
    expect(callsAfterFirst).toBeLessThanOrEqual(3);
  });
});
