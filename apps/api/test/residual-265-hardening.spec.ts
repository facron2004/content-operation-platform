import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';

const srcRoot = path.join(__dirname, '..', 'src');
const webRoot = path.join(__dirname, '..', '..', 'web', 'src');

describe('residual #265 GMV + refund top-merchants LIMIT honesty', () => {
  it('pageMerchants emits limit/truncated from GMV_TOP_MERCHANTS_LIMIT', async () => {
    const src = await readFile(path.join(srcRoot, 'gmv', 'gmv-metrics.ts'), 'utf8');
    const start = src.indexOf('export function pageMerchants');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('export function sortAndPageMerchants', start + 10);
    const block = src.slice(start, end > 0 ? end : start + 900);
    expect(block).toMatch(/GMV_TOP_MERCHANTS_LIMIT/);
    expect(block).toMatch(/truncated/);
    expect(block).toMatch(/limit/);
    expect(block).toMatch(/sorted\.length\s*>=\s*limit/);
  });

  it('pageTopMerchants emits limit/truncated from GMV_TOP_MERCHANTS_LIMIT', async () => {
    const src = await readFile(path.join(srcRoot, 'refund', 'refund-top-merchants.ts'), 'utf8');
    const start = src.indexOf('export function pageTopMerchants');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('// --- refund-top-merchants.ts ---', start + 10);
    const block = src.slice(start, end > 0 ? end : start + 900);
    expect(block).toMatch(/GMV_TOP_MERCHANTS_LIMIT/);
    expect(block).toMatch(/truncated/);
    expect(block).toMatch(/limit/);
    expect(block).toMatch(/items\.length\s*>=\s*limit/);
  });

  it('SPA GMV + refund clients declare limit/truncated', async () => {
    const gmv = await readFile(path.join(webRoot, 'services', 'api', 'gmv.api.ts'), 'utf8');
    const gmvStart = gmv.indexOf('export async function getGmvByMerchant');
    expect(gmvStart).toBeGreaterThanOrEqual(0);
    const gmvBlock = gmv.slice(gmvStart, gmvStart + 700);
    expect(gmvBlock).toMatch(/limit\?:/);
    expect(gmvBlock).toMatch(/truncated\?:/);

    const refund = await readFile(path.join(webRoot, 'services', 'api', 'refund.api.ts'), 'utf8');
    const refundStart = refund.indexOf('export const getRefundTopMerchants');
    expect(refundStart).toBeGreaterThanOrEqual(0);
    const refundBlock = refund.slice(refundStart, refundStart + 700);
    expect(refundBlock).toMatch(/limit\?:/);
    expect(refundBlock).toMatch(/truncated\?:/);
  });

  it('SPA GMV + refund tables show cap hint when truncated', async () => {
    const gmvTable = await readFile(
      path.join(webRoot, 'features', 'gmv', 'components', 'GmvTopMerchantsTable.vue'),
      'utf8'
    );
    expect(gmvTable).toMatch(/truncated/);
    expect(gmvTable).toMatch(/ranking-cap-hint/);
    expect(gmvTable).toMatch(/排行仅加载前/);

    const refundTable = await readFile(
      path.join(webRoot, 'features', 'refund', 'components', 'RefundMerchantTable.vue'),
      'utf8'
    );
    expect(refundTable).toMatch(/truncated/);
    expect(refundTable).toMatch(/ranking-cap-hint/);
    expect(refundTable).toMatch(/排行仅加载前/);
  });

  it('SPA cores track merchantTruncated/merchantLimit', async () => {
    const gmvCore = await readFile(
      path.join(webRoot, 'features', 'gmv', 'composables', 'gmv-cockpit-core.ts'),
      'utf8'
    );
    expect(gmvCore).toMatch(/merchantTruncated:\s*ref\(false\)/);
    expect(gmvCore).toMatch(/merchantLimit:\s*ref/);
    expect(gmvCore).toMatch(/result\.truncated/);
    expect(gmvCore).toMatch(/result\.limit/);

    const refundCore = await readFile(
      path.join(webRoot, 'features', 'refund', 'composables', 'refund-verify-core.ts'),
      'utf8'
    );
    expect(refundCore).toMatch(/merchantTruncated:\s*ref\(false\)/);
    expect(refundCore).toMatch(/merchantLimit:\s*ref/);
    expect(refundCore).toMatch(/result\.truncated/);
    expect(refundCore).toMatch(/result\.limit/);
  });
});
