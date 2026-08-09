import { describe, expect, it } from 'vitest';

describe('residual #75 merchant metric-first head', () => {
  it('listMerchantRowsByMetric + computeMerchantsWithStale metric path', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const queries = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant', 'merchant-list-queries.ts'),
      'utf8'
    );
    const projection = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant', 'merchant-list-projection.ts'),
      'utf8'
    );
    const src = [projection, queries].join('\n');
    expect(src).toContain('listMerchantRowsByMetric');
    expect(src).toContain('buildMerchantListFilters');
    // Metric sorts must not fall through to merchantId ASC head.
    expect(src).toMatch(
      /sort === 'totalGmvDesc' \|\| sort === 'stale30Desc' \|\| sort === 'staleDesc'/
    );
    expect(src).toMatch(/ORDER BY \$\{orderBy\}/);
    expect(src).toMatch(/"totalGmv30d" DESC/);
    expect(src).toMatch(/"stale30SkuCount" DESC/);
    // totalSkuDesc still uses prune-by-totalSku listMerchantRows path.
    expect(src).toMatch(/totalSkuDesc[\s\S]*listMerchantRows/);
  });
});

describe('residual #75 alert batch scope IN', () => {
  it('assertPackagesInScope + batch resolve uses one IN lookup', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const guards = await fs.readFile(
      path.join(__dirname, '..', 'src', 'user-access', 'scope-guards.ts'),
      'utf8'
    );
    const controller = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'alert.controller.ts'),
      'utf8'
    );
    expect(guards).toContain('assertPackagesInScope');
    expect(guards).toMatch(/packageId" IN \(\$\{ph\}\)/);
    // Single-id path delegates to batch.
    expect(guards).toMatch(
      /assertPackageInScope[\s\S]*assertPackagesInScope\(prisma, \[id\], req\)/
    );
    expect(controller).toContain('assertAlertPackagesInScope');
    expect(controller).toContain('assertPackagesInScope');
    // resolve-batch must not loop sequential assertAlertPackageInScope.
    expect(controller).not.toMatch(
      /for \(const alertId of alertIds\) \{\s*await this\.assertAlertPackageInScope/
    );
  });
});

describe('residual #75 last-sales date bound', () => {
  it('loadLastSalesByPackage accepts fromDate; merchants path passes bound', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const loaders = await fs.readFile(
      path.join(__dirname, '..', 'src', 'zero-sales', 'zero-sales-package-sales-loaders.ts'),
      'utf8'
    );
    const list = await fs.readFile(
      path.join(__dirname, '..', 'src', 'zero-sales', 'zero-sales-list.ts'),
      'utf8'
    );
    expect(loaders).toMatch(/loadLastSalesByPackage\([\s\S]*fromDate\?: string/);
    expect(loaders).toMatch(/date" >= \?/);
    expect(list).toContain('lastSaleFrom');
    expect(list).toMatch(/loadLastSalesByPackage\(prisma, filteredIds, lastSaleFrom\)/);
    expect(list).toContain('stale60Days');
  });
});
