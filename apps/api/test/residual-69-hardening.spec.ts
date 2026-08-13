import { describe, expect, it } from 'vitest';
import { HEAVY_LIST_CACHE_MAX_SIZE } from '../src/common/heavy-aggregate-gate';
import { USER_ROLES } from '@content/shared';

describe('residual #69 overview heavy gate + cache bound', () => {
  it('OverviewService gates cold loaders and bounds cache maxSize', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const svc = await fs.readFile(
      path.join(__dirname, '..', 'src', 'overview', 'overview.service.ts'),
      'utf8'
    );
    const kpis = await fs.readFile(
      path.join(__dirname, '..', 'src', 'overview', 'overview-kpis.ts'),
      'utf8'
    );
    expect(svc).toContain('withHeavyAggregateGate');
    expect(svc).toContain('HEAVY_LIST_CACHE_MAX_SIZE');
    expect(svc).toMatch(/new TtlCache\(OVERVIEW_TTL_MS,\s*HEAVY_LIST_CACHE_MAX_SIZE\)/);
    expect(svc).toMatch(/HeavyAggregateQueueFullError/);
    expect(svc).toMatch(/总览计算繁忙/);
    // KPI cold path opt-in to heavy gate via 4th arg.
    expect(svc).toMatch(/loadOverviewKpis\([^)]*true,\s*force\s*\)/);
    expect(kpis).toContain('withHeavyAggregateGate');
    expect(kpis).toMatch(/useHeavyGate/);
  });
});

describe('residual #69 money cache maxSize bounds', () => {
  it('GMV/refund/merchant-sales use HEAVY_LIST_CACHE_MAX_SIZE', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const gmv = await fs.readFile(
      path.join(__dirname, '..', 'src', 'gmv', 'gmv.service.ts'),
      'utf8'
    );
    const refund = await fs.readFile(
      path.join(__dirname, '..', 'src', 'refund', 'refund.service.ts'),
      'utf8'
    );
    const ms = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant-sales', 'merchant-sales.service.ts'),
      'utf8'
    );
    expect(gmv).toContain('HEAVY_LIST_CACHE_MAX_SIZE');
    expect(gmv).toMatch(/new TtlCache\(GMV_CACHE_TTL_MS,\s*HEAVY_LIST_CACHE_MAX_SIZE\)/);
    expect(refund).toContain('HEAVY_LIST_CACHE_MAX_SIZE');
    expect(refund).toMatch(/new TtlCache\(REFUND_CACHE_TTL_MS,\s*HEAVY_LIST_CACHE_MAX_SIZE\)/);
    expect(ms).toContain('HEAVY_LIST_CACHE_MAX_SIZE');
    expect(ms).toMatch(/new TtlCache\(MERCHANT_SALES_CACHE_TTL_MS,\s*HEAVY_LIST_CACHE_MAX_SIZE\)/);
    expect(HEAVY_LIST_CACHE_MAX_SIZE).toBe(64);
  });
});

describe('residual #69 alert cache + role IsIn', () => {
  it('AlertService bounds aggregateCache; AlertQueryDto role IsIn USER_ROLES', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const alert = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'alert.service.ts'),
      'utf8'
    );
    const dto = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'content.dto.ts'),
      'utf8'
    );
    const ctrl = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'alert.controller.ts'),
      'utf8'
    );
    expect(alert).toContain('HEAVY_LIST_CACHE_MAX_SIZE');
    expect(alert).toMatch(
      /new TtlCache\(\s*ALERT_AGGREGATE_TTL_MS,\s*HEAVY_LIST_CACHE_MAX_SIZE\s*\)/
    );
    expect(dto).toContain('USER_ROLES');
    expect(dto).toMatch(/@IsIn\(\[\.\.\.USER_ROLES\]\)/);
    // OpsTodayQueryDto also IsIn.
    expect(dto).toMatch(/class OpsTodayQueryDto[\s\S]{0,120}@IsIn\(\[\.\.\.USER_ROLES\]\)/);
    expect(ctrl).toMatch(/limit:\s*15/);
    expect(USER_ROLES.length).toBeGreaterThan(0);
  });
});

describe('residual #69 overview throttle tighten', () => {
  it('overview controller long limits <= 20', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'overview', 'overview.controller.ts'),
      'utf8'
    );
    expect(src).toMatch(/kpis[\s\S]{0,80}limit:\s*20|limit:\s*20[\s\S]{0,80}getKpis/);
    expect(src).toMatch(
      /top-offenders[\s\S]{0,80}limit:\s*15|limit:\s*15[\s\S]{0,80}getTopOffenders/
    );
    // No remaining 30/min on overview.
    expect(src).not.toMatch(/limit:\s*30/);
  });
});
