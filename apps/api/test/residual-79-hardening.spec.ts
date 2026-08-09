import { describe, expect, it } from 'vitest';
import { DATA_ANALYSIS_OH_CONCURRENCY } from '../src/common/sql-chunk';

describe('residual #79 overview KPI concurrency inside heavy-gate slot', () => {
  it('loadOverviewKpis uses mapPool not bare Promise.all for KPI legs', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'overview', 'overview-kpis.ts'),
      'utf8'
    );
    expect(src).toContain('mapPool');
    expect(src).toContain('DATA_ANALYSIS_OH_CONCURRENCY');
    expect(DATA_ANALYSIS_OH_CONCURRENCY).toBe(2);
    // Must not bare-Promise.all the four cold legs.
    expect(src).not.toMatch(/await Promise\.all\(\[\s*\n?\s*countDistinctMerchants/);
    expect(src).not.toMatch(/Promise\.all\(\[\s*countDistinctMerchants/);
  });

  it('aggregateStaleSkuStats runs histogram then merchant DISTINCT sequentially', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'overview', 'overview-stale.ts'),
      'utf8'
    );
    // No parallel bucket + merchant DISTINCT inside stale stats.
    const fnStart = src.indexOf('export async function aggregateStaleSkuStats');
    const fnEnd = src.indexOf('\nexport async function aggregateStaleBucketStats', fnStart);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toContain('loadPlatformStaleBucketStats');
    expect(fn).toContain('COUNT(DISTINCT "merchantId")');
    expect(fn).not.toMatch(/Promise\.all\(\[/);
  });
});

describe('residual #79 campaign + task batch scope IN', () => {
  it('campaign assertScopeIdsExist uses IN not per-id LIMIT 1 loops', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'campaign', 'campaign.service.ts'),
      'utf8'
    );
    const fnStart = src.indexOf('private async assertScopeIdsExist');
    expect(fnStart).toBeGreaterThan(0);
    // Slice until next private method.
    const next = src.indexOf('\n  private async ', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);
    expect(fn).toMatch(/merchantId" IN \(\$\{ph\}\)/);
    expect(fn).toMatch(/areaId" IN \(\$\{ph\}\)/);
    // No per-id sequential LIMIT 1 pattern in the rewritten body.
    expect(fn).not.toMatch(/WHERE "merchantId" = \? LIMIT 1/);
    expect(fn).not.toMatch(/WHERE "areaId" = \? LIMIT 1/);
  });

  it('task batchCreate uses assertPackagesInScope once', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(
        __dirname,
        '..',
        'src',
        'distribution-task',
        'distribution-task-command.controller.ts'
      ),
      'utf8'
    );
    expect(src).toContain('assertPackagesInScope');
    // batchCreate must call the batch helper (not N sequential single asserts).
    const start = src.indexOf('async batchCreate');
    const end = src.indexOf('\n  @Roles(', start);
    const fn = src.slice(start, end > 0 ? end : undefined);
    expect(fn).toContain('assertPackagesInScope');
    expect(fn).not.toMatch(/for \(const item of items\)[\s\S]*assertPackageInScope/);
  });
});
