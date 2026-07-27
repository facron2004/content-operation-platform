import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { DASHBOARD_GENERATED_COPY_TAKE } from '../src/common/sql-chunk';

const srcRoot = path.join(__dirname, '..', 'src');
const webRoot = path.join(__dirname, '..', '..', 'web', 'src');
const sharedRoot = path.join(__dirname, '..', '..', '..', 'packages', 'shared', 'src');

describe('residual #286 DASHBOARD_GENERATED_COPY_TAKE title-join honesty', () => {
  it('DASHBOARD_GENERATED_COPY_TAKE is 500', () => {
    expect(DASHBOARD_GENERATED_COPY_TAKE).toBe(500);
  });

  it('computePerformance projects titleJoin* honesty fields', async () => {
    const src = await readFile(path.join(srcRoot, 'content', 'dashboard.service.ts'), 'utf8');
    const start = src.indexOf('private async computePerformance(');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('statusDistribution(', start + 10);
    const fn = src.slice(start, end > 0 ? end : start + 6000);
    expect(fn).toMatch(/DASHBOARD_GENERATED_COPY_TAKE/);
    expect(fn).toMatch(/titleJoinLimit\s*=\s*DASHBOARD_GENERATED_COPY_TAKE/);
    expect(fn).toMatch(/titleJoinLoaded\s*=\s*copies\.length/);
    expect(fn).toMatch(/titleJoinTruncated\s*=\s*titleJoinLoaded\s*>=\s*titleJoinLimit/);
    expect(fn).toMatch(/titleJoinMissed/);
    expect(fn).toMatch(/titleJoinLimit,/);
    expect(fn).toMatch(/titleJoinLoaded,/);
    expect(fn).toMatch(/titleJoinTruncated/);
    expect(fn).toMatch(/titleJoinMissed/);
  });

  it('shared PerformanceResponse + SPA sink titleJoin* honesty', async () => {
    const shared = await readFile(
      path.join(sharedRoot, 'api-content-performance-types.ts'),
      'utf8'
    );
    expect(shared).toMatch(/titleJoinLimit\?:/);
    expect(shared).toMatch(/titleJoinLoaded\?:/);
    expect(shared).toMatch(/titleJoinTruncated\?:/);
    expect(shared).toMatch(/titleJoinMissed\?:/);

    const table = await readFile(
      path.join(webRoot, 'features', 'performance', 'components', 'PerformanceItemsTable.vue'),
      'utf8'
    );
    expect(table).toMatch(/titleJoinTruncated/);
    expect(table).toMatch(/文案标题\/版本仅关联最近/);

    const page = await readFile(
      path.join(webRoot, 'features', 'performance', 'composables', 'usePerformancePage.ts'),
      'utf8'
    );
    expect(page).toMatch(/titleJoinTruncated\s*=\s*computed/);
    expect(page).toMatch(/titleJoinLimit\s*=\s*computed/);
    expect(page).toMatch(/titleJoinLoaded\s*=\s*computed/);
    expect(page).toMatch(/titleJoinMissed\s*=\s*computed/);

    const view = await readFile(path.join(webRoot, 'views', 'PerformanceView.vue'), 'utf8');
    expect(view).toMatch(/title-join-truncated/);
    expect(view).toMatch(/titleJoinTruncated/);
  });
});
