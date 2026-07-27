import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';

const srcRoot = path.join(__dirname, '..', 'src');
const webRoot = path.join(__dirname, '..', '..', 'web', 'src');

describe('residual #264 merchant-sales ranking LIMIT honesty', () => {
  it('paginateRankingRows emits limit/truncated/totalMerchants (#250/#263 parity)', async () => {
    const src = await readFile(
      path.join(srcRoot, 'merchant-sales', 'merchant-sales-query.ts'),
      'utf8'
    );
    const start = src.indexOf('export function paginateRankingRows');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('// --- merchant-sales-trend-map.ts ---', start + 10);
    const block = src.slice(start, end > 0 ? end : start + 1200);
    expect(block).toMatch(/RankingPageMeta|totalMerchants/);
    expect(block).toMatch(/GMV_TOP_MERCHANTS_LIMIT/);
    expect(block).toMatch(/truncated/);
    expect(block).toMatch(/limit/);
    // Page math stays over capped head; honesty lives on sibling fields.
    expect(block).toMatch(/total:\s*all\.length/);
  });

  it('loadMerchantSalesRanking parallel-loads countMerchants with ranking head', async () => {
    const src = await readFile(
      path.join(srcRoot, 'merchant-sales', 'merchant-sales-load.ts'),
      'utf8'
    );
    expect(src).toMatch(/rankingCount/);
    expect(src).toMatch(/countMerchants/);
    expect(src).toMatch(/GMV_TOP_MERCHANTS_LIMIT/);
    const start = src.indexOf('export async function loadMerchantSalesRanking');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('// --- merchant-sales-load-trend.ts ---', start + 10);
    const block = src.slice(start, end > 0 ? end : start + 1200);
    expect(block).toMatch(/Promise\.all/);
    expect(block).toMatch(/totalMerchants/);
    expect(block).toMatch(/paginateRankingRows\([\s\S]*totalMerchants/);
  });

  it('MerchantSalesRanking DTO + SPA type declare honesty fields', async () => {
    const dto = await readFile(
      path.join(srcRoot, 'merchant-sales', 'merchant-sales.dto.ts'),
      'utf8'
    );
    // Prefer exact interface name — RankingRow would match a looser prefix.
    const dtoStart = dto.indexOf('export interface MerchantSalesRanking {');
    expect(dtoStart).toBeGreaterThanOrEqual(0);
    const dtoBlock = dto.slice(dtoStart, dtoStart + 700);
    expect(dtoBlock).toMatch(/limit\?:/);
    expect(dtoBlock).toMatch(/truncated\?:/);
    expect(dtoBlock).toMatch(/totalMerchants\?:/);

    const api = await readFile(
      path.join(webRoot, 'services', 'api', 'merchant-sales.api.ts'),
      'utf8'
    );
    const apiStart = api.indexOf('export interface MerchantSalesRanking {');
    expect(apiStart).toBeGreaterThanOrEqual(0);
    const apiBlock = api.slice(apiStart, apiStart + 500);
    expect(apiBlock).toMatch(/limit\?:/);
    expect(apiBlock).toMatch(/truncated\?:/);
    expect(apiBlock).toMatch(/totalMerchants\?:/);
  });

  it('SPA ranking table shows cap hint when truncated', async () => {
    const src = await readFile(
      path.join(
        webRoot,
        'features',
        'merchant-sales',
        'components',
        'MerchantSalesRankingTable.vue'
      ),
      'utf8'
    );
    expect(src).toMatch(/truncated\?:/);
    expect(src).toMatch(/limit\?:/);
    expect(src).toMatch(/totalMerchants\?:/);
    expect(src).toMatch(/ranking-cap-hint/);
    expect(src).toMatch(/ranking\.truncated/);
    expect(src).toMatch(/排行仅加载前/);
  });
});
