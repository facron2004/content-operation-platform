import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import {
  MERCHANT_LIST_CACHE_CAP,
  MOVEMENT_CACHE_CAP,
  ZERO_SALES_MERCHANTS_CACHE_CAP,
  ZERO_SALES_SKUS_CACHE_CAP
} from '../src/common/sql-chunk';

const srcRoot = path.join(__dirname, '..', 'src');
const webRoot = path.join(__dirname, '..', '..', 'web', 'src');

describe('residual #266 cache-head list LIMIT honesty', () => {
  it('cache caps stay at known ceilings', () => {
    expect(MERCHANT_LIST_CACHE_CAP).toBe(2_000);
    expect(MOVEMENT_CACHE_CAP).toBe(2_000);
    expect(ZERO_SALES_MERCHANTS_CACHE_CAP).toBe(2_000);
    expect(ZERO_SALES_SKUS_CACHE_CAP).toBeGreaterThanOrEqual(1_000);
  });

  it('paginateMerchantItems emits limit/truncated from MERCHANT_LIST_CACHE_CAP', async () => {
    const src = await readFile(
      path.join(srcRoot, 'merchant', 'merchant-list-projection.ts'),
      'utf8'
    );
    const start = src.indexOf('export function paginateMerchantItems');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('export async function computeMerchantsWithStale', start + 10);
    const block = src.slice(start, end > 0 ? end : start + 900);
    expect(block).toMatch(/MERCHANT_LIST_CACHE_CAP/);
    expect(block).toMatch(/truncated:\s*items\.length\s*>=\s*limit/);
    expect(block).toMatch(/limit,/);
  });

  it('paginateMovementSkuRows emits limit/truncated from MOVEMENT_CACHE_CAP', async () => {
    const src = await readFile(
      path.join(srcRoot, 'movement', 'movement-sku-projection.ts'),
      'utf8'
    );
    const start = src.indexOf('export function paginateMovementSkuRows');
    expect(start).toBeGreaterThanOrEqual(0);
    const block = src.slice(start, start + 900);
    expect(block).toMatch(/MOVEMENT_CACHE_CAP/);
    expect(block).toMatch(/truncated:\s*rows\.length\s*>=\s*limit/);
    expect(block).toMatch(/limit,/);
  });

  it('zero-sales paginators emit limit/truncated from cache caps', async () => {
    const src = await readFile(path.join(srcRoot, 'zero-sales', 'zero-sales-list.ts'), 'utf8');
    const mStart = src.indexOf('export function paginateZeroSalesMerchants');
    expect(mStart).toBeGreaterThanOrEqual(0);
    const mEnd = src.indexOf('export function zeroSalesMerchantsCacheKey', mStart + 10);
    const mBlock = src.slice(mStart, mEnd > 0 ? mEnd : mStart + 900);
    expect(mBlock).toMatch(/ZERO_SALES_MERCHANTS_CACHE_CAP/);
    expect(mBlock).toMatch(/truncated:\s*rows\.length\s*>=\s*limit/);

    const sStart = src.indexOf('export function paginateZeroSalesSkus');
    expect(sStart).toBeGreaterThanOrEqual(0);
    const sBlock = src.slice(sStart, sStart + 1600);
    expect(sBlock).toMatch(/ZERO_SALES_SKUS_CACHE_CAP/);
    expect(sBlock).toMatch(/truncated:\s*rows\.length\s*>=\s*limit/);
  });

  it('SPA clients declare limit/truncated on list responses', async () => {
    const merchant = await readFile(
      path.join(webRoot, 'services', 'api', 'merchant.api.ts'),
      'utf8'
    );
    const mType = merchant.indexOf('export interface MerchantListResponse');
    expect(mType).toBeGreaterThanOrEqual(0);
    const mBody = merchant.slice(mType, mType + 400);
    expect(mBody).toMatch(/limit\?:/);
    expect(mBody).toMatch(/truncated\?:/);

    const movement = await readFile(
      path.join(webRoot, 'services', 'api', 'movement.api.ts'),
      'utf8'
    );
    const mvType = movement.indexOf('export type MovementListResponse');
    expect(mvType).toBeGreaterThanOrEqual(0);
    const mvBody = movement.slice(mvType, mvType + 400);
    expect(mvBody).toMatch(/limit\?:/);
    expect(mvBody).toMatch(/truncated\?:/);

    const zs = await readFile(path.join(webRoot, 'services', 'api', 'zero-sales.api.ts'), 'utf8');
    const zsType = zs.indexOf('export interface ZeroSalesListResponse');
    expect(zsType).toBeGreaterThanOrEqual(0);
    const zsBody = zs.slice(zsType, zsType + 400);
    expect(zsBody).toMatch(/limit\?:/);
    expect(zsBody).toMatch(/truncated\?:/);
  });

  it('SPA tables show list-cap-hint when truncated', async () => {
    const merchant = await readFile(
      path.join(webRoot, 'features', 'merchants', 'components', 'MerchantListPanel.vue'),
      'utf8'
    );
    expect(merchant).toMatch(/list-cap-hint/);
    expect(merchant).toMatch(/truncated/);
    expect(merchant).toMatch(/列表仅加载前/);

    const movement = await readFile(
      path.join(webRoot, 'features', 'movement', 'components', 'MovementSkuTable.vue'),
      'utf8'
    );
    expect(movement).toMatch(/list-cap-hint/);
    expect(movement).toMatch(/truncated/);
    expect(movement).toMatch(/列表仅加载前/);

    const zsMerchant = await readFile(
      path.join(webRoot, 'features', 'zero-sales', 'components', 'ZeroSalesMerchantTable.vue'),
      'utf8'
    );
    expect(zsMerchant).toMatch(/list-cap-hint/);
    expect(zsMerchant).toMatch(/truncated/);

    const zsSku = await readFile(
      path.join(webRoot, 'features', 'zero-sales', 'components', 'ZeroSalesSkuTable.vue'),
      'utf8'
    );
    expect(zsSku).toMatch(/list-cap-hint/);
    expect(zsSku).toMatch(/truncated/);
  });

  it('SPA cores track listTruncated/listLimit or merchant/sku honesty sinks', async () => {
    const merchantCore = await readFile(
      path.join(webRoot, 'features', 'merchants', 'composables', 'merchant-core.ts'),
      'utf8'
    );
    expect(merchantCore).toMatch(/listTruncated:\s*ref\(false\)/);
    expect(merchantCore).toMatch(/listLimit:\s*ref/);
    expect(merchantCore).toMatch(/result\.truncated/);
    expect(merchantCore).toMatch(/result\.limit/);

    const movementCore = await readFile(
      path.join(webRoot, 'features', 'movement', 'composables', 'movement-list-core.ts'),
      'utf8'
    );
    expect(movementCore).toMatch(/listTruncated:\s*ref\(false\)/);
    expect(movementCore).toMatch(/listLimit:\s*ref/);
    expect(movementCore).toMatch(/result\.truncated/);
    expect(movementCore).toMatch(/result\.limit/);

    const zsCore = await readFile(
      path.join(webRoot, 'features', 'zero-sales', 'composables', 'zero-sales-core.ts'),
      'utf8'
    );
    expect(zsCore).toMatch(/merchantTruncated:\s*ref\(false\)/);
    expect(zsCore).toMatch(/merchantLimit:\s*ref/);
    expect(zsCore).toMatch(/skuTruncated:\s*ref\(false\)/);
    expect(zsCore).toMatch(/skuLimit:\s*ref/);
    expect(zsCore).toMatch(/result\.truncated/);
    expect(zsCore).toMatch(/result\.limit/);
  });
});
