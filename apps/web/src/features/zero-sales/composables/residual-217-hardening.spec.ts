import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #217 zero-sales SKU sort filter', () => {
  it('zero-sales.api getZeroSalesSkus accepts sort', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/zero-sales.api.ts'), 'utf8');
    expect(src).toMatch(/getZeroSalesSkus[\s\S]{0,250}sort\?:/);
  });

  it('zero-sales-core filters + load pass sort', async () => {
    const src = await readFile(path.join(__dirname, 'zero-sales-core.ts'), 'utf8');
    expect(src).toMatch(/ZeroSalesSort/);
    expect(src).toMatch(/sort\?: ZeroSalesSort/);
    // Pin body assignment (not the type signature alone).
    expect(src).toMatch(/sort:\s*state\.filters\.value\.sort/);
    expect(src).toMatch(/getZeroSalesSkus\(\{[\s\S]{0,400}sort:\s*params\.sort/);
  });

  it('ZeroSalesFilterFields exposes sort select on sku tab', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/ZeroSalesFilterFields.vue'),
      'utf8'
    );
    expect(src).toMatch(/update:sort/);
    expect(src).toMatch(/lastSalesDateAsc/);
    expect(src).toMatch(/staleDesc/);
    expect(src).toMatch(/gmvDesc/);
  });

  it('ZeroSalesFilters + PageBody wire update:sort', async () => {
    const filters = await readFile(
      path.join(__dirname, '../components/ZeroSalesFilters.vue'),
      'utf8'
    );
    expect(filters).toMatch(/update:sort/);

    const body = await readFile(
      path.join(__dirname, '../components/ZeroSalesPageBody.vue'),
      'utf8'
    );
    expect(body).toMatch(/@update:sort="filters\.sort/);
  });
});
