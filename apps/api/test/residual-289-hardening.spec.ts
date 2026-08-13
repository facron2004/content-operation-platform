import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { mapDistributionRows } from '../src/gmv/gmv-metrics';
import { computeDistributionFromOrderHeader } from '../src/gmv/gmv-order-header-distribution';
import type { PrismaService } from '../src/prisma/prisma.service';

const srcRoot = path.join(__dirname, '..', 'src');
const webRoot = path.join(__dirname, '..', '..', 'web', 'src');

describe('residual #289 GMV distribution LIMIT honesty', () => {
  it('mapDistributionRows projects items/limit/matched/truncated + other long-tail', () => {
    const full = mapDistributionRows(
      [
        { key: 'A', gmvFen: 50n, gmvOnlineFen: 50n, gmvWalletFen: 0n, gmvBonusFen: 0n },
        { key: 'B', gmvFen: 50n, gmvOnlineFen: 50n, gmvWalletFen: 0n, gmvBonusFen: 0n }
      ],
      100n,
      2
    );
    expect(full.truncated).toBe(false);
    expect(full.items).toHaveLength(2);
    expect(full.limit).toBe(2);
    expect(full.matched).toBe(2);

    const partial = mapDistributionRows(
      [{ key: 'A', gmvFen: 80n, gmvOnlineFen: 80n, gmvWalletFen: 0n, gmvBonusFen: 0n }],
      100n,
      1
    );
    expect(partial.truncated).toBe(true);
    expect(partial.items).toHaveLength(2);
    expect(partial.items[0].key).toBe('A');
    expect(partial.items[1].key).toBe('其他'); // 其他
    expect(partial.items[1].totalGmvFen).toBe(20n);
    expect(partial.items[0].share).toBeCloseTo(0.8);
    expect(partial.limit).toBe(1);
    expect(partial.matched).toBeGreaterThanOrEqual(2);
  });

  it('keeps a negative or zero LIMIT tail visible and exactly reconciled', () => {
    const signed = mapDistributionRows(
      [
        { key: 'A', gmvFen: 120n, gmvOnlineFen: 120n, gmvWalletFen: 0n },
        { key: 'B', gmvFen: -20n, gmvOnlineFen: -20n, gmvWalletFen: 0n }
      ],
      100n,
      1
    );

    expect(signed.truncated).toBe(true);
    expect(signed.items.map((row) => [row.key, row.totalGmvFen, row.share])).toEqual([
      ['A', 120n, 1.2],
      ['其他', -20n, -0.2]
    ]);
    expect(signed.items.reduce((sum, row) => sum + (row.totalGmvFen ?? 0n), 0n)).toBe(100n);
    expect(signed.items.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(1);
    expect(signed.items[1]).toMatchObject({ gmvOnlineFen: null, gmvWalletFen: null });

    const zeroTail = mapDistributionRows(
      [
        { key: 'A', gmvFen: 100n },
        { key: 'B', gmvFen: 0n }
      ],
      100n,
      1
    );
    expect(zeroTail.truncated).toBe(true);
    expect(zeroTail.items[1]).toMatchObject({ key: '其他', totalGmvFen: 0n });
  });

  it('uses a stable LIMIT+1 probe and does not erase a real zero-net day', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ totalGmvFen: 0n }])
      .mockResolvedValueOnce([
        {
          key: '美食',
          gmvFen: 0n,
          gmvOnlineFen: 6_000n,
          gmvWalletFen: 0n,
          gmvBonusFen: 0n,
          refundFen: 6_000n
        }
      ]);

    const result = await computeDistributionFromOrderHeader(
      { $queryRawUnsafe: query } as unknown as PrismaService,
      'category',
      8,
      '2025-03-10'
    );

    expect(query.mock.calls[1]?.at(-1)).toBe(9);
    expect(String(query.mock.calls[1]?.[0])).toContain('ORDER BY "gmvFen" DESC, "key" ASC');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ key: '美食', totalGmvFen: 0n, share: 0 });
  });

  it('computeDistributionFromOrderHeader + resolve return payload type', async () => {
    const oh = await readFile(
      path.join(srcRoot, 'gmv', 'gmv-order-header-distribution.ts'),
      'utf8'
    );
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
