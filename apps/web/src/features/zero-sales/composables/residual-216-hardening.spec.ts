import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → zero-sales → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #216 zero-sales merchantId filter UI', () => {
  it('zero-sales.api + core already pass merchantId', async () => {
    const api = await readFile(path.join(srcRoot, 'services/api/zero-sales.api.ts'), 'utf8');
    expect(api).toMatch(/getZeroSalesMerchants[\s\S]{0,200}merchantId/);
    expect(api).toMatch(/getZeroSalesSkus[\s\S]{0,200}merchantId/);

    const core = await readFile(path.join(__dirname, 'zero-sales-core.ts'), 'utf8');
    expect(core).toMatch(/merchantId\?:/);
    expect(core).toMatch(/zeroSalesFilterParams[\s\S]{0,200}merchantId/);
  });

  it('ZeroSalesFilterFields exposes merchantId input + update emit', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/ZeroSalesFilterFields.vue'),
      'utf8'
    );
    expect(src).toMatch(/filters\.merchantId/);
    expect(src).toMatch(/update:merchantId/);
    expect(src).toMatch(/merchantId/);
  });

  it('ZeroSalesFilters bubbles update:merchantId', async () => {
    const src = await readFile(path.join(__dirname, '../components/ZeroSalesFilters.vue'), 'utf8');
    expect(src).toMatch(/update:merchant-id|update:merchantId/);
    expect(src).toMatch(/emit\('update:merchantId'/);
  });

  it('ZeroSalesPageBody wires merchantId filter into page filters', async () => {
    const src = await readFile(path.join(__dirname, '../components/ZeroSalesPageBody.vue'), 'utf8');
    expect(src).toMatch(/@update:merchant-id="filters\.merchantId = \$event"/);
  });
});
