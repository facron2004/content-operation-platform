import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';

const srcRoot = path.join(__dirname, '..', 'src');
const webRoot = path.join(__dirname, '..', '..', 'web', 'src');
const sharedRoot = path.join(__dirname, '..', '..', '..', 'packages', 'shared', 'src');

describe('residual #274 RESOLVED_ALERT_DAY_LIMIT honesty', () => {
  it('loadResolvedAlertIds returns Set + honesty meta with take LIMIT+1', async () => {
    const src = await readFile(path.join(srcRoot, 'content', 'alert-resolution.ts'), 'utf8');
    const start = src.indexOf('export async function loadResolvedAlertIds(');
    expect(start).toBeGreaterThanOrEqual(0);
    const fn = src.slice(start);
    expect(fn).toMatch(/RESOLVED_ALERT_DAY_LIMIT/);
    expect(fn).toMatch(/take:\s*limit\s*\+\s*1/);
    expect(fn).toMatch(/orderBy:\s*\{\s*resolvedAt:\s*'asc'\s*\}/);
    expect(fn).toMatch(/truncated/);
    expect(fn).toMatch(/ids:\s*new Set/);
    expect(fn).toMatch(/loaded:/);
  });

  it('getOperationAlerts projects resolvedIds* honesty fields', async () => {
    const src = await readFile(path.join(srcRoot, 'content', 'alert.service.ts'), 'utf8');
    const start = src.indexOf('async getOperationAlerts(');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('invalidateAggregateCache(', start + 10);
    const fn = src.slice(start, end > 0 ? end : start + 3000);
    expect(fn).toMatch(/resolvedMeta\.ids/);
    expect(fn).toMatch(/resolvedIdsLimit:\s*resolvedMeta\.limit/);
    expect(fn).toMatch(/resolvedIdsLoaded:\s*resolvedMeta\.loaded/);
    expect(fn).toMatch(/resolvedIdsTruncated:\s*resolvedMeta\.truncated/);
  });

  it('controller emptyScope projects resolvedIds honesty fields', async () => {
    const src = await readFile(path.join(srcRoot, 'content', 'alert.controller.ts'), 'utf8');
    expect(src).toMatch(/resolvedIdsLimit/);
    expect(src).toMatch(/resolvedIdsLoaded/);
    expect(src).toMatch(/resolvedIdsTruncated:\s*false/);
  });

  it('shared AlertsResponse declares resolvedIds* fields', async () => {
    const src = await readFile(path.join(sharedRoot, 'api-alerts-types.ts'), 'utf8');
    expect(src).toMatch(/resolvedIdsLimit\?:/);
    expect(src).toMatch(/resolvedIdsLoaded\?:/);
    expect(src).toMatch(/resolvedIdsTruncated\?:/);
  });

  it('SPA sinks honesty + shows list-cap-hint', async () => {
    const core = await readFile(
      path.join(webRoot, 'features', 'alerts', 'composables', 'alert-types.ts'),
      'utf8'
    );
    expect(core).toMatch(/resolvedIdsTruncated\?:/);

    const useAlerts = await readFile(
      path.join(webRoot, 'features', 'alerts', 'composables', 'useAlerts.ts'),
      'utf8'
    );
    expect(useAlerts).toMatch(/resolvedIdsTruncated\s*=\s*computed/);
    expect(useAlerts).toMatch(/resolvedIdsTruncated,/);

    const view = await readFile(path.join(webRoot, 'views', 'AlertsView.vue'), 'utf8');
    expect(view).toMatch(/list-cap-hint/);
    expect(view).toMatch(/resolvedIdsTruncated/);
    expect(view).toMatch(/今日已处理记录超过/);
  });
});
