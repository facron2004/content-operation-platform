import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { mapDistributionRows } from '../src/gmv/gmv-metrics';

const srcRoot = path.join(__dirname, '..', 'src');
const webRoot = path.join(__dirname, '..', '..', 'web', 'src');

describe('residual #289 GMV distribution LIMIT honesty', () => {
  it('mapDistributionRows projects items/limit/matched/truncated + other long-tail', () => {
    const full = mapDistributionRows(
      [
        { key: 'A', gmv: 50, gmvOnline: 50, gmvWallet: 0, gmvBonus: 0 },
        { key: 'B', gmv: 50, gmvOnline: 50, gmvWallet: 0, gmvBonus: 0 }
      ],
      100,
      2
    );
    expect(full.truncated).toBe(false);
    expect(full.items).toHaveLength(2);
    expect(full.limit).toBe(2);
    expect(full.matched).toBe(2);

    const partial = mapDistributionRows(
      [{ key: 'A', gmv: 80, gmvOnline: 80, gmvWallet: 0, gmvBonus: 0 }],
      100,
      1
    );
    expect(partial.truncated).toBe(true);
    expect(partial.items).toHaveLength(2);
    expect(partial.items[0].key).toBe('A');
    expect(partial.items[1].key).toBe('其他'); // 其他
    expect(partial.items[1].totalGmv).toBeCloseTo(20);
    expect(partial.items[0].share).toBeCloseTo(0.8);
    expect(partial.limit).toBe(1);
    expect(partial.matched).toBeGreaterThanOrEqual(2);
  });

  it('computeDistributionFromOrderHeader + resolve return payload type', async () => {
    const oh = await readFile(path.join(srcRoot, 'gmv', 'gmv-order-header.ts'), 'utf8');
    const start = oh.indexOf('export async function computeDistributionFromOrderHeader');
    expect(start).toBeGreaterThanOrEqual(0);
    const fn = oh.slice(start, start + 1200);
    expect(fn).toMatch(/Promise<GmvDistributionPayload>/);
    expect(fn).toMatch(/mapDistributionRows\(rows,\s*totalGmv,\s*safeLimit\)/);

    const resolve = await readFile(path.join(srcRoot, 'gmv', 'gmv-resolve.ts'), 'utf8');
    const rStart = resolve.indexOf('export async function resolveGmvDistribution');
    expect(rStart).toBeGreaterThanOrEqual(0);
    expect(resolve.slice(rStart, rStart + 400)).toMatch(/Promise<GmvDistributionPayload>/);

    const service = await readFile(path.join(srcRoot, 'gmv', 'gmv.service.ts'), 'utf8');
    expect(service).toMatch(/as Promise<GmvDistributionPayload>/);
  });

  it('SPA GmvDistributionResponse + chart card surface honesty', async () => {
    const api = await readFile(path.join(webRoot, 'services', 'api', 'gmv.api.ts'), 'utf8');
    expect(api).toMatch(/export interface GmvDistributionResponse/);
    expect(api).toMatch(/get<GmvDistributionResponse>/);
    expect(api).toMatch(/items:/);
    expect(api).toMatch(/truncated:/);

    const core = await readFile(
      path.join(webRoot, 'features', 'gmv', 'composables', 'gmv-cockpit-core.ts'),
      'utf8'
    );
    expect(core).toMatch(/distributionTruncated/);
    expect(core).toMatch(/payload\.items/);
    expect(core).toMatch(/payload\.truncated/);

    const card = await readFile(
      path.join(webRoot, 'features', 'gmv', 'components', 'GmvCockpitChartCard.vue'),
      'utf8'
    );
    expect(card).toMatch(/truncated/);
    expect(card).toMatch(/list-cap-hint/);
    expect(card).toMatch(/limitLabel/);

    const body = await readFile(
      path.join(webRoot, 'features', 'gmv', 'components', 'GmvCockpitBody.vue'),
      'utf8'
    );
    expect(body).toMatch(/distributionTruncated/);
    expect(body).toMatch(/:truncated="distributionTruncated"/);

    const view = await readFile(path.join(webRoot, 'views', 'GmvCockpitView.vue'), 'utf8');
    expect(view).toMatch(/distributionTruncated/);
    expect(view).toMatch(/:distribution-truncated="distributionTruncated"/);

    // mapCategoryRows keeps long-tail (no drop of synthetic other key); prefers server share.
    const extras = await readFile(
      path.join(webRoot, 'features', 'gmv', 'composables', 'gmv-cockpit-extras.ts'),
      'utf8'
    );
    const mapStart = extras.indexOf('export function mapCategoryRows');
    expect(mapStart).toBeGreaterThanOrEqual(0);
    const mapFn = extras.slice(mapStart, mapStart + 900);
    expect(mapFn).toMatch(/hasServerShare/);
    // Must NOT re-drop the synthetic other bucket inside mapCategoryRows.
    expect(mapFn).not.toMatch(/!== '其他'/);
    expect(extras).toMatch(/categoryPayload\?\.items/);
  });
});
