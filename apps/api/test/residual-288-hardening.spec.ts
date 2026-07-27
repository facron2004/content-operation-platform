import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';

const srcRoot = path.join(__dirname, '..', 'src');
const webRoot = path.join(__dirname, '..', '..', 'web', 'src');

describe('residual #288 overview distribution LIMIT honesty', () => {
  it('loadDimDistribution projects items/limit/matched/truncated via LIMIT+1 probe', async () => {
    const src = await readFile(path.join(srcRoot, 'overview', 'overview-distribution.ts'), 'utf8');
    expect(src).toMatch(/export type OverviewDistributionPayload/);
    const start = src.indexOf('export async function loadDimDistribution');
    expect(start).toBeGreaterThanOrEqual(0);
    const fn = src.slice(start, start + 1400);
    expect(fn).toMatch(/safeLimit \+ 1|limit \+ 1/);
    expect(fn).toMatch(/truncated\s*=\s*raw\.length\s*>\s*safeLimit/);
    expect(fn).toMatch(/matched:/);
    expect(fn).toMatch(/truncated/);
    expect(fn).toMatch(/items,/);
    expect(fn).toMatch(/limit:\s*safeLimit/);
  });

  it('loadOverviewDistribution returns payload for stale + area/category', async () => {
    const src = await readFile(path.join(srcRoot, 'overview', 'overview-distribution.ts'), 'utf8');
    const start = src.indexOf('export async function loadOverviewDistribution');
    expect(start).toBeGreaterThanOrEqual(0);
    const fn = src.slice(start, start + 1200);
    expect(fn).toMatch(/Promise<OverviewDistributionPayload>/);
    expect(fn).toMatch(/matched:/);
    expect(fn).toMatch(/truncated/);
    // stale path still clips but projects honesty.
    expect(fn).toMatch(/all\.slice\(0,\s*safeLimit\)|all\.length/);
  });

  it('SPA OverviewDistributionResponse + chart card surface honesty', async () => {
    const api = await readFile(path.join(webRoot, 'services', 'api', 'overview.api.ts'), 'utf8');
    expect(api).toMatch(/export interface OverviewDistributionResponse/);
    expect(api).toMatch(/get<OverviewDistributionResponse>/);
    expect(api).toMatch(/items:/);
    expect(api).toMatch(/truncated:/);

    const core = await readFile(
      path.join(webRoot, 'features', 'overview', 'composables', 'overview-core.ts'),
      'utf8'
    );
    expect(core).toMatch(/distributionTruncated/);
    expect(core).toMatch(/payload\.items/);
    expect(core).toMatch(/payload\.truncated/);

    const card = await readFile(
      path.join(webRoot, 'features', 'overview', 'components', 'OverviewChartCard.vue'),
      'utf8'
    );
    expect(card).toMatch(/truncated/);
    expect(card).toMatch(/list-cap-hint|仅展示/);
    expect(card).toMatch(/limitLabel/);

    const row = await readFile(
      path.join(webRoot, 'features', 'overview', 'components', 'OverviewChartsRow.vue'),
      'utf8'
    );
    expect(row).toMatch(/distributionTruncated/);
    expect(row).toMatch(/:truncated="distributionTruncated"/);

    const view = await readFile(path.join(webRoot, 'views', 'OverviewView.vue'), 'utf8');
    expect(view).toMatch(/distribution-truncated|distributionTruncated/);
    expect(view).toMatch(/:distribution-truncated="distributionTruncated"/);

    // zero-sales summary also consumes distribution — must unwrap items.
    const zs = await readFile(
      path.join(webRoot, 'features', 'zero-sales', 'composables', 'useZeroSalesPage.ts'),
      'utf8'
    );
    expect(zs).toMatch(/stale\.items|payload\.items/);
  });
});
