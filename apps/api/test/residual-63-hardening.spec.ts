import { describe, expect, it } from 'vitest';
import {
  MERCHANT_LIST_CACHE_CAP,
  MOVEMENT_CACHE_CAP,
  QUERY_IN_CHUNKS_CONCURRENCY,
  ZERO_SALES_MERCHANTS_CACHE_CAP
} from '../src/common/sql-chunk';

describe('residual #63 ceilings', () => {
  it('exports cache caps + queryInChunks concurrency bound', () => {
    expect(ZERO_SALES_MERCHANTS_CACHE_CAP).toBe(2_000);
    expect(MERCHANT_LIST_CACHE_CAP).toBe(2_000);
    expect(ZERO_SALES_MERCHANTS_CACHE_CAP).toBe(MOVEMENT_CACHE_CAP);
    expect(MERCHANT_LIST_CACHE_CAP).toBe(MOVEMENT_CACHE_CAP);
    expect(QUERY_IN_CHUNKS_CONCURRENCY).toBe(2);
    expect(QUERY_IN_CHUNKS_CONCURRENCY).toBeGreaterThanOrEqual(1);
    expect(QUERY_IN_CHUNKS_CONCURRENCY).toBeLessThanOrEqual(4);
  });
});

describe('residual #63 auditCopy package select hygiene', () => {
  it('uses PACKAGE_AUDIT_SELECT for machine audit (Residual #133) and status-only error re-read', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const packageMappers = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'package-mappers.ts'),
      'utf8'
    );
    const audit = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'copy-audit.service.ts'),
      'utf8'
    );
    const query = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'copy-query.service.ts'),
      'utf8'
    );
    // Residual #133: hot audit path uses slim PACKAGE_AUDIT_SELECT.
    expect(packageMappers).toContain('PACKAGE_AUDIT_SELECT');
    expect(packageMappers).toContain('mapPackageForAudit');
    // Full map select retained for generate/detail paths.
    expect(packageMappers).toContain('PACKAGE_MAP_SELECT');
    expect(packageMappers).toContain('export function mapPackage');
    expect(audit).toContain('PACKAGE_AUDIT_SELECT');
    expect(audit).toMatch(/select:\s*PACKAGE_AUDIT_SELECT/);
    expect(audit).not.toMatch(/select:\s*PACKAGE_MAP_SELECT/);
    expect(audit).toMatch(/select:\s*\{\s*auditStatus:\s*true\s*\}/);
    // List scope IN lists clamped to 200.
    expect(query).toMatch(/filters\.areaIds\.slice\(0,\s*200\)/);
    expect(query).toMatch(/filters\.merchantIds\.slice\(0,\s*200\)/);
  });
});

describe('residual #63 zero-sales merchants cache cap', () => {
  it('computeZeroSalesMerchants slices to ZERO_SALES_MERCHANTS_CACHE_CAP', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'zero-sales', 'zero-sales-list.ts'),
      'utf8'
    );
    expect(src).toContain('ZERO_SALES_MERCHANTS_CACHE_CAP');
    expect(src).toMatch(/slice\(0,\s*ZERO_SALES_MERCHANTS_CACHE_CAP\)/);
  });
});

describe('residual #63 queryInChunks concurrency pool', () => {
  it('pools multi-chunk work instead of unbounded Promise.all', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'common', 'sql-chunk-runtime.ts'),
      'utf8'
    );
    expect(src).toContain('QUERY_IN_CHUNKS_CONCURRENCY');
    // Must not Promise.all(chunks.map) for multi-chunk path.
    expect(src).not.toMatch(/Promise\.all\(\s*chunks\.map/);
    expect(src).toMatch(/workerCount|QUERY_IN_CHUNKS_CONCURRENCY/);
  });
});

describe('residual #63 merchant list cap + DISTINCT sales', () => {
  it('caps merchants and uses single-pass metrics SQL', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const queries = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant', 'merchant-list-queries.ts'),
      'utf8'
    );
    const metrics = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant', 'merchant-list-metrics.ts'),
      'utf8'
    );
    const projection = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant', 'merchant-list-projection.ts'),
      'utf8'
    );
    const src = [queries, metrics, projection].join('\n');
    expect(src).toContain('MERCHANT_LIST_CACHE_CAP');
    expect(src).toMatch(/slice\(0,\s*MERCHANT_LIST_CACHE_CAP\)/);
    // Single-pass metrics: DISTINCT recent sales inside CTE (not package materialize path).
    expect(src).toMatch(/SELECT DISTINCT s\."packageId"|SELECT DISTINCT "packageId"/);
    expect(src).toContain('collectMerchantMetricMaps');
  });
});

describe('residual #63 refund + movement-today getOrLoad', () => {
  it('uses cache.getOrLoad single-flight', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const refund = await fs.readFile(
      path.join(__dirname, '..', 'src', 'refund', 'refund-load.ts'),
      'utf8'
    );
    const mov = await fs.readFile(
      path.join(__dirname, '..', 'src', 'movement', 'movement-today.ts'),
      'utf8'
    );
    expect(refund).toMatch(/cache\.getOrLoad/);
    expect(refund).not.toMatch(/cache\.get</);
    expect(mov).toMatch(/cache\.getOrLoad/);
    expect(mov).not.toMatch(/cache\.get</);
  });
});

describe('residual #63 zero-sales DISTINCT recent sales', () => {
  it('loadStaleCandidates filter-first NOT EXISTS (replaces DISTINCT membership pass)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'zero-sales', 'zero-sales-candidates.ts'),
      'utf8'
    );
    // Filter-first: NOT EXISTS in the candidate SQL itself (no second DISTINCT pass).
    expect(src).toMatch(/NOT EXISTS/);
    expect(src).toMatch(/PackageSalesDaily/);
    expect(src).not.toMatch(/contentPackage\.findMany/);
  });
});
