import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';

const srcRoot = path.join(__dirname, '..', 'src');
const webRoot = path.join(__dirname, '..', '..', 'web', 'src');
const sharedRoot = path.join(__dirname, '..', '..', '..', 'packages', 'shared', 'src');

describe('residual #284 performance items DASHBOARD_COPY_PERF_TAKE honesty', () => {
  it('computePerformance projects itemsLimit/itemsLoaded/itemsTruncated', async () => {
    const src = await readFile(path.join(srcRoot, 'content', 'dashboard.service.ts'), 'utf8');
    const start = src.indexOf('private async computePerformance(');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('statusDistribution(', start + 10);
    const fn = src.slice(start, end > 0 ? end : start + 5000);
    expect(fn).toMatch(/DASHBOARD_COPY_PERF_TAKE/);
    expect(fn).toMatch(/itemsLimit\s*=\s*DASHBOARD_COPY_PERF_TAKE/);
    expect(fn).toMatch(/itemsLoaded\s*=\s*performances\.length/);
    expect(fn).toMatch(/itemsTruncated\s*=\s*itemsLoaded\s*>=\s*itemsLimit/);
    expect(fn).toMatch(/itemsLimit,/);
    expect(fn).toMatch(/itemsLoaded,/);
    expect(fn).toMatch(/itemsTruncated/);
  });

  it('shared PerformanceResponse + SPA sink items* honesty', async () => {
    const shared = await readFile(
      path.join(sharedRoot, 'api-content-performance-types.ts'),
      'utf8'
    );
    expect(shared).toMatch(/itemsLimit\?:/);
    expect(shared).toMatch(/itemsLoaded\?:/);
    expect(shared).toMatch(/itemsTruncated\?:/);

    const table = await readFile(
      path.join(webRoot, 'features', 'performance', 'components', 'PerformanceItemsTable.vue'),
      'utf8'
    );
    expect(table).toMatch(/itemsTruncated/);
    expect(table).toMatch(/效果明细仅加载最近/);

    const page = await readFile(
      path.join(webRoot, 'features', 'performance', 'composables', 'usePerformancePage.ts'),
      'utf8'
    );
    expect(page).toMatch(/itemsTruncated\s*=\s*computed/);
    expect(page).toMatch(/itemsLimit\s*=\s*computed/);
    expect(page).toMatch(/itemsLoaded\s*=\s*computed/);

    const view = await readFile(path.join(webRoot, 'views', 'PerformanceView.vue'), 'utf8');
    expect(view).toMatch(/items-truncated/);
    expect(view).toMatch(/itemsTruncated/);
  });

  it('DASHBOARD_COPY_PERF_TAKE constant is 200', async () => {
    const src = await readFile(path.join(srcRoot, 'common', 'sql-chunk.ts'), 'utf8');
    expect(src).toMatch(/export const DASHBOARD_COPY_PERF_TAKE\s*=\s*200/);
  });
});
