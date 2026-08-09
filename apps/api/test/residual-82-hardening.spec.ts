import { describe, expect, it } from 'vitest';

describe('residual #82 campaign getPerformance 90d task counts', () => {
  it('bounds DistributionTask counts + TPD fan-out to interactive exclusive window', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'campaign', 'campaign.service.ts'),
      'utf8'
    );
    // Task status counts must carry exclusive createdAt window (not unbounded full history).
    expect(src).toMatch(
      /FROM "DistributionTask"\s+WHERE "campaignId" = \?\s+AND \$\{sqlDatetimeExclusiveRange\('"createdAt"'\)\}/
    );
    // TPD subquery also filters campaign tasks by the same exclusive createdAt window.
    expect(src).toMatch(
      /SELECT "taskId" FROM "DistributionTask"\s+WHERE "campaignId" = \?\s+AND \$\{sqlDatetimeExclusiveRange\('"createdAt"'\)\}/
    );
    expect(src).toContain('INTERACTIVE_LIST_MAX_DAYS');
    expect(src).toContain('beijingDayRangeSqlite');
    expect(src).toContain('sqlDatetimeExclusiveRange');
  });
});

describe('residual #82 community import batch re-read', () => {
  it('import returns count only — no per-id getById and no post-commit re-read (Residual #171)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'community', 'community.service.ts'),
      'utf8'
    );
    const fnStart = src.indexOf('async import(');
    expect(fnStart).toBeGreaterThan(0);
    // Slice until next method at same indent.
    const next = src.indexOf('\n  async ', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);
    // Residual #171 superseded the #82 IN-re-read: SPA discards the import body
    // and reloads the list, so import only returns the imported count.
    expect(fn).toMatch(/imported: groupIds\.length/);
    // No sequential per-id getById re-read after commit.
    expect(fn).not.toMatch(/for \(const id of groupIds\)[\s\S]{0,80}getById/);
    expect(fn).not.toMatch(/this\.getById\(/);
  });
});

describe('residual #82 user scope-id batch assert', () => {
  it('assertScopeIdsExist batches merchant/area IN checks (campaign parity)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'user-access', 'application', 'user-role-policy.ts'),
      'utf8'
    );
    const fnStart = src.indexOf('export async function assertScopeIdsExist');
    expect(fnStart).toBeGreaterThan(0);
    const fn = src.slice(fnStart);
    expect(fn).toMatch(/WHERE "merchantId" IN \(\$\{ph\}\)/);
    expect(fn).toMatch(/WHERE "areaId" IN \(\$\{ph\}\)/);
    // No per-binding sequential SELECT LIMIT 1.
    expect(fn).not.toMatch(/WHERE "merchantId" = \? LIMIT 1/);
    expect(fn).not.toMatch(/WHERE "areaId" = \? LIMIT 1/);
  });
});

describe('residual #82 zero-sales merchants mapPool', () => {
  it('computeZeroSalesMerchants caps concurrent loaders via mapPool', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'zero-sales', 'zero-sales-list.ts'),
      'utf8'
    );
    expect(src).toContain('mapPool');
    expect(src).toContain('DATA_ANALYSIS_OH_CONCURRENCY');
    expect(src).toContain('enrichJobs');
    // Cold enrich legs run under mapPool, not unbounded Promise.all.
    expect(src).toMatch(/mapPool\(enrichJobs,\s*DATA_ANALYSIS_OH_CONCURRENCY/);
    expect(src).toContain('loadGmvByPackage');
    expect(src).toContain('loadLastSalesByPackage');
    expect(src).toContain('loadTotalSkuByMerchant');
    expect(src).not.toMatch(
      /Promise\.all\(\[\s*\(\)\s*=>\s*loadGmvByPackage[\s\S]*?loadLastSalesByPackage[\s\S]*?loadTotalSkuByMerchant/
    );
  });
});
