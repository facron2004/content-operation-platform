import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → merchants → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #250 merchant SKU list LIMIT honesty SPA', () => {
  it('merchant-core tracks skuTruncated/skuLimit from getMerchantSkus', async () => {
    const src = await readFile(path.join(__dirname, 'merchant-core.ts'), 'utf8');
    expect(src).toMatch(/skuTruncated:\s*ref\(false\)/);
    expect(src).toMatch(/skuLimit:\s*ref<\s*number\s*\|\s*null\s*>\(null\)/);
    expect(src).toMatch(/skuTruncated\?:/);
    expect(src).toMatch(/skuLimit\?:/);
    expect(src).toMatch(/skus\.truncated/);
    expect(src).toMatch(/skus\.limit/);
  });

  it('useMerchants exposes skuTruncated + skuLimit', async () => {
    const src = await readFile(path.join(__dirname, 'useMerchants.ts'), 'utf8');
    expect(src).toMatch(/skuTruncated,/);
    expect(src).toMatch(/skuLimit,/);
    expect(src).toMatch(/skuTruncated,/);
    // reloadDetail forwards sinks.
    const reloadStart = src.indexOf('async function reloadDetail');
    expect(reloadStart).toBeGreaterThanOrEqual(0);
    const reloadEnd = src.indexOf('\n  function selectMerchant', reloadStart + 10);
    const reload = src.slice(reloadStart, reloadEnd > 0 ? reloadEnd : undefined);
    expect(reload).toMatch(/skuTruncated/);
    expect(reload).toMatch(/skuLimit/);
  });

  it('MerchantSkuTable shows + and cap hint when truncated', async () => {
    const src = await readFile(path.join(__dirname, '../components/MerchantSkuTable.vue'), 'utf8');
    expect(src).toMatch(/truncated\s*\?\s*'\+'/);
    expect(src).toMatch(/sku-cap-hint/);
    expect(src).toMatch(/truncated\?:/);
    expect(src).toMatch(/limit\?:/);
  });

  it('MerchantDetailPanel + MerchantsView wire skuTruncated/skuLimit', async () => {
    const panel = await readFile(
      path.join(__dirname, '../components/MerchantDetailPanel.vue'),
      'utf8'
    );
    expect(panel).toMatch(/:truncated="skuTruncated"/);
    expect(panel).toMatch(/:limit="skuLimit"/);

    const types = await readFile(
      path.join(__dirname, '../components/merchant-detail-panel-types.ts'),
      'utf8'
    );
    expect(types).toMatch(/skuTruncated\?:/);
    expect(types).toMatch(/skuLimit\?:/);

    const view = await readFile(path.join(srcRoot, 'views/MerchantsView.vue'), 'utf8');
    expect(view).toMatch(/:sku-truncated="skuTruncated"/);
    expect(view).toMatch(/:sku-limit="skuLimit"/);
  });
});
