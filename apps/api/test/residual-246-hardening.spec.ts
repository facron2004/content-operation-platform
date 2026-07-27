import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { merchantSkusCacheKey } from '../src/merchant/merchant.service';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, '../src');

describe('residual #246 merchant listSkus honors days', () => {
  it('merchantSkusCacheKey includes days dimension', () => {
    expect(merchantSkusCacheKey('M1', '2026-07-24', 7)).toBe('merchants:skus|2026-07-24|M1|7');
    expect(merchantSkusCacheKey('M1', '2026-07-24', 7)).not.toBe(
      merchantSkusCacheKey('M1', '2026-07-24', 90)
    );
  });

  it('listSkus threads query.days into load + cache key', async () => {
    const service = await readFile(path.join(srcRoot, 'merchant/merchant.service.ts'), 'utf8');
    const listStart = service.indexOf('async listSkus');
    expect(listStart).toBeGreaterThan(-1);
    const listEnd = service.indexOf('async listCompetitors', listStart + 10);
    const listFn = service.slice(listStart, listEnd > 0 ? listEnd : undefined);
    expect(listFn).toMatch(/query\.days/);
    expect(listFn).toMatch(/merchantSkusCacheKey\(merchantId,\s*today,\s*days\)/);
    expect(listFn).toMatch(/loadMerchantSkuRows\(this\.prisma,\s*merchantId,\s*days\)/);
    expect(listFn).toMatch(/days/);
  });

  it('loadMerchantSkuRows accepts days window (not hard-coded 60)', async () => {
    const src = await readFile(path.join(srcRoot, 'merchant/merchant-sku.ts'), 'utf8');
    expect(src).toMatch(/export async function loadMerchantSkuRows\([\s\S]{0,200}days\s*=/);
    expect(src).toMatch(/windowDays/);
    // Must not still hard-code only stale60Days for the threshold.
    const fnStart = src.indexOf('export async function loadMerchantSkuRows');
    const fnEnd = src.indexOf('export function mapMerchantSkuRows', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).not.toMatch(/stale60Days\s*-\s*1/);
    expect(fn).toMatch(/windowDays\s*-\s*1/);
  });

  it('SPA getMerchantSkus already forwards days (baseline)', async () => {
    const src = await readFile(
      path.resolve(__dirname, '../../web/src/services/api/merchant.api.ts'),
      'utf8'
    );
    expect(src).toMatch(/export async function getMerchantSkus\(merchantId:\s*string,\s*days/);
    expect(src).toMatch(/params:\s*\{\s*days\s*\}/);
  });
});
