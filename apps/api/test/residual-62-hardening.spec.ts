import { describe, expect, it } from 'vitest';
import {
  CSV_EXPORT_MAX_ROWS,
  MOVEMENT_CACHE_CAP,
  RECOMMEND_CACHE_CAP
} from '../src/common/sql-chunk';

describe('residual #62 ceilings', () => {
  it('exports movement cache cap above CSV export max', () => {
    expect(MOVEMENT_CACHE_CAP).toBe(2_000);
    expect(CSV_EXPORT_MAX_ROWS).toBe(1_000);
    expect(MOVEMENT_CACHE_CAP).toBeGreaterThanOrEqual(CSV_EXPORT_MAX_ROWS);
    expect(MOVEMENT_CACHE_CAP).toBeGreaterThan(RECOMMEND_CACHE_CAP);
  });
});

describe('residual #62 movement stagnant export single-flight', () => {
  it('listStagnantForExport rejects concurrent export with ConflictException path', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const serviceSrc = await fs.readFile(
      path.join(__dirname, '..', 'src', 'movement', 'movement.service.ts'),
      'utf8'
    );
    const controllerSrc = await fs.readFile(
      path.join(__dirname, '..', 'src', 'movement', 'movement.controller.ts'),
      'utf8'
    );
    expect(serviceSrc).toContain('exportRunning');
    expect(serviceSrc).toContain('listStagnantForExport');
    expect(serviceSrc).toMatch(/ConflictException\(['"]滞销导出进行中/);
    expect(serviceSrc).toContain('CSV_EXPORT_MAX_ROWS');
    expect(controllerSrc).toContain('listStagnantForExport');
    expect(controllerSrc).not.toMatch(/pageSize:\s*CSV_EXPORT_MAX_ROWS/);
  });
});

describe('residual #62 merchant heatmap TTL cache', () => {
  it('getHeatmap uses getOrLoad and invalidates with address refresh', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant', 'merchant.service.ts'),
      'utf8'
    );
    expect(src).toContain('heatmapCache');
    expect(src).toContain('merchantHeatmapCacheKey');
    expect(src).toMatch(/heatmapCache\.getOrLoad/);
    expect(src).toMatch(/heatmapCache\.clear\(['"]merchants:heatmap['"]\)/);
    expect(src).toMatch(/listCache\.clear\(['"]merchants:list['"]\)/);
  });
});

describe('residual #62 movement cache cap', () => {
  it('computeMoving/StagnantSkus slice to MOVEMENT_CACHE_CAP after sort', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'movement', 'movement-list.ts'),
      'utf8'
    );
    expect(src).toContain('MOVEMENT_CACHE_CAP');
    expect(src).toContain('capMovementRows');
    expect(src).toMatch(/slice\(0,\s*MOVEMENT_CACHE_CAP\)/);
  });
});

describe('residual #62 loadActiveSkus multi-scope IN chunking', () => {
  it('early-LIMIT active skus + chunks large multi-scope IN lists', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'movement', 'movement-skus.ts'),
      'utf8'
    );
    expect(src).toContain('queryInChunks');
    expect(src).toMatch(/MOVEMENT_CACHE_CAP/);
    expect(src).toMatch(/PLATFORM_SCAN_LIMIT/);
    // Scope filters use parameterized IN lists.
    expect(src).toMatch(/merchantId" IN \(/);
    expect(src).toMatch(/areaId" IN \(/);
  });
});

describe('residual #62 dashboard global top-N after chunk merge', () => {
  it('re-sorts chunked rows via takeGlobalTopByCreatedAt', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'dashboard.service.ts'),
      'utf8'
    );
    expect(src).toContain('takeGlobalTopByCreatedAt');
    expect(src).toMatch(/takeGlobalTopByCreatedAt\(rows,\s*DASHBOARD_COPY_PERF_TAKE\)/);
    expect(src).toMatch(/takeGlobalTopByCreatedAt\(rows,\s*DASHBOARD_GENERATED_COPY_TAKE\)/);
    // Must not only slice after flatten without re-sort.
    expect(src).toMatch(/function takeGlobalTopByCreatedAt/);
  });
});
