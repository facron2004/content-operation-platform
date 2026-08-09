import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';

const srcRoot = path.join(__dirname, '..', 'src');
const webRoot = path.join(__dirname, '..', '..', 'web', 'src');
const sharedRoot = path.join(__dirname, '..', '..', '..', 'packages', 'shared', 'src');

describe('residual #275 RECOMMEND_CACHE_CAP source-cap honesty', () => {
  it('alert aggregate caches source* honesty from matchedCount vs packages', async () => {
    const src = await readFile(path.join(srcRoot, 'content', 'alert.service.ts'), 'utf8');
    const start = src.indexOf('async getOperationAlerts(');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('invalidateAggregateCache(', start + 10);
    const fn = src.slice(start, end > 0 ? end : start + 4000);
    expect(fn).toMatch(/RECOMMEND_CACHE_CAP/);
    expect(fn).toMatch(/sourceMatchedCount/);
    expect(fn).toMatch(/sourceLimit/);
    expect(fn).toMatch(/sourceTruncated:\s*sourceMatchedCount\s*>\s*packages\.length/);
    expect(fn).toMatch(/sourceMatchedCount:\s*aggregate\.sourceMatchedCount/);
    expect(fn).toMatch(/sourceLimit:\s*aggregate\.sourceLimit/);
    expect(fn).toMatch(/sourceTruncated:\s*aggregate\.sourceTruncated/);
  });

  it('controller emptyScope projects source* honesty fields', async () => {
    const src = await readFile(path.join(srcRoot, 'content', 'alert.controller.ts'), 'utf8');
    expect(src).toMatch(/sourceMatchedCount:\s*0/);
    expect(src).toMatch(/sourceLimit:\s*0/);
    expect(src).toMatch(/sourceTruncated:\s*false/);
  });

  it('dashboard projects source* + resolvedIds* honesty fields', async () => {
    const src = await readFile(
      path.join(srcRoot, 'content', 'dashboard-operations-read.ts'),
      'utf8'
    );
    expect(src).toMatch(/RECOMMEND_CACHE_CAP/);
    expect(src).toMatch(/sourceLimit\s*=\s*RECOMMEND_CACHE_CAP/);
    expect(src).toMatch(/sourceTruncated\s*=\s*sourceMatchedCount\s*>\s*packages\.length/);
    expect(src).toMatch(/sourceMatchedCount,/);
    expect(src).toMatch(/sourceLimit,/);
    expect(src).toMatch(/sourceTruncated,/);
    expect(src).toMatch(/resolvedIdsLimit:\s*resolvedMeta\.limit/);
    expect(src).toMatch(/resolvedIdsLoaded:\s*resolvedMeta\.loaded/);
    expect(src).toMatch(/resolvedIdsTruncated:\s*resolvedMeta\.truncated/);
  });

  it('shared AlertsResponse + TodayOperationConsole declare source* fields', async () => {
    const alerts = await readFile(path.join(sharedRoot, 'api-alerts-types.ts'), 'utf8');
    expect(alerts).toMatch(/sourceMatchedCount\?:/);
    expect(alerts).toMatch(/sourceLimit\?:/);
    expect(alerts).toMatch(/sourceTruncated\?:/);

    const consoleTypes = await readFile(
      path.join(sharedRoot, 'operation-console-today-types.ts'),
      'utf8'
    );
    expect(consoleTypes).toMatch(/sourceMatchedCount\?:/);
    expect(consoleTypes).toMatch(/sourceLimit\?:/);
    expect(consoleTypes).toMatch(/sourceTruncated\?:/);
    expect(consoleTypes).toMatch(/resolvedIdsTruncated\?:/);
  });

  it('SPA Alerts sinks source* honesty + list-cap-hint', async () => {
    const core = await readFile(
      path.join(webRoot, 'features', 'alerts', 'composables', 'alert-types.ts'),
      'utf8'
    );
    expect(core).toMatch(/sourceTruncated\?:/);
    expect(core).toMatch(/sourceMatchedCount\?:/);

    const useAlerts = await readFile(
      path.join(webRoot, 'features', 'alerts', 'composables', 'useAlerts.ts'),
      'utf8'
    );
    expect(useAlerts).toMatch(/sourceTruncated\s*=\s*computed/);
    expect(useAlerts).toMatch(/sourceTruncated,/);
    expect(useAlerts).toMatch(/sourceLimit,/);
    expect(useAlerts).toMatch(/sourceMatchedCount,/);

    const view = await readFile(path.join(webRoot, 'views', 'AlertsView.vue'), 'utf8');
    expect(view).toMatch(/list-cap-hint/);
    expect(view).toMatch(/sourceTruncated/);
    expect(view).toMatch(/推荐源仅加载评分前/);
  });

  it('SPA Dashboard sinks source*/resolvedIds* honesty + list-cap-hint', async () => {
    const consoleMap = await readFile(
      path.join(webRoot, 'features', 'dashboard', 'composables', 'dashboard-console.ts'),
      'utf8'
    );
    expect(consoleMap).toMatch(/sourceTruncated\?:/);
    expect(consoleMap).toMatch(/sourceTruncated:\s*raw\.sourceTruncated\s*===\s*true/);
    expect(consoleMap).toMatch(/resolvedIdsTruncated:\s*raw\.resolvedIdsTruncated\s*===\s*true/);

    const view = await readFile(path.join(webRoot, 'views', 'DashboardView.vue'), 'utf8');
    expect(view).toMatch(/list-cap-hint/);
    expect(view).toMatch(/consoleData\.sourceTruncated/);
    expect(view).toMatch(/consoleData\.resolvedIdsTruncated/);
    expect(view).toMatch(/推荐源仅加载评分前/);
    expect(view).toMatch(/今日已处理记录超过/);

    const css = await readFile(path.join(webRoot, 'styles', 'views', 'dashboard.css'), 'utf8');
    expect(css).toMatch(/\.list-cap-hint\s*\{/);
  });
});
