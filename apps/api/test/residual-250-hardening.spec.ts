import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { MERCHANT_SKU_LIST_LIMIT } from '../src/common/sql-chunk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, '../src');

describe('residual #250 merchant SKU list LIMIT honesty', () => {
  it('MERCHANT_SKU_LIST_LIMIT remains 500', () => {
    expect(MERCHANT_SKU_LIST_LIMIT).toBe(500);
  });

  it('listSkus echoes limit + truncated from MERCHANT_SKU_LIST_LIMIT', async () => {
    const service = await readFile(path.join(srcRoot, 'merchant/merchant.service.ts'), 'utf8');
    expect(service).toMatch(/MERCHANT_SKU_LIST_LIMIT/);
    const listStart = service.indexOf('async listSkus');
    expect(listStart).toBeGreaterThan(-1);
    const listEnd = service.indexOf('async listCompetitors', listStart + 10);
    const listFn = service.slice(listStart, listEnd > 0 ? listEnd : undefined);
    expect(listFn).toMatch(/const limit\s*=\s*MERCHANT_SKU_LIST_LIMIT/);
    expect(listFn).toMatch(/truncated:\s*items\.length\s*>=\s*limit/);
    expect(listFn).toMatch(/limit,/);
  });

  it('queryMerchantSkuRows still binds MERCHANT_SKU_LIST_LIMIT (baseline #55)', async () => {
    const src = await readFile(path.join(srcRoot, 'merchant/merchant-sku.ts'), 'utf8');
    expect(src).toContain('MERCHANT_SKU_LIST_LIMIT');
    expect(src).toMatch(/LIMIT \?/);
  });

  it('SPA MerchantSkuListResponse declares limit + truncated', async () => {
    const src = await readFile(
      path.resolve(__dirname, '../../web/src/services/api/merchant.api.ts'),
      'utf8'
    );
    const typeStart = src.indexOf('export interface MerchantSkuListResponse');
    expect(typeStart).toBeGreaterThanOrEqual(0);
    const typeEnd = src.indexOf('export interface MerchantCompetitor', typeStart + 10);
    const typeBody = src.slice(typeStart, typeEnd > 0 ? typeEnd : undefined);
    expect(typeBody).toMatch(/limit\?:/);
    expect(typeBody).toMatch(/truncated\?:/);
  });
});
