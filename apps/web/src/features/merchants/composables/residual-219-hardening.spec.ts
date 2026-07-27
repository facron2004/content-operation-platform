import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → merchants → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #219 merchant list areaId + sort filters', () => {
  it('merchant.api listMerchants accepts areaId + sort', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/merchant.api.ts'), 'utf8');
    expect(src).toMatch(/listMerchants[\s\S]{0,200}areaId\?:/);
    expect(src).toMatch(/sort\?: 'stale30Desc' \| 'totalSkuDesc' \| 'totalGmvDesc'/);
  });

  it('merchant-core state + loadMerchantList pass areaId + sort', async () => {
    const src = await readFile(path.join(__dirname, 'merchant-core.ts'), 'utf8');
    expect(src).toMatch(/MerchantListSort/);
    expect(src).toMatch(/areaId:\s*ref/);
    expect(src).toMatch(/sort:\s*ref/);
    expect(src).toMatch(/listMerchants\(\{[\s\S]{0,300}areaId/);
    expect(src).toMatch(/listMerchants\(\{[\s\S]{0,300}sort/);
  });

  it('MerchantListPanel exposes areaId + sort controls', async () => {
    const src = await readFile(path.join(__dirname, '../components/MerchantListPanel.vue'), 'utf8');
    expect(src).toMatch(/update:areaId/);
    expect(src).toMatch(/update:sort/);
    expect(src).toMatch(/filter-change/);
    expect(src).toMatch(/stale30Desc|sortOptions/);
  });

  it('MerchantsView wires areaId/sort + onFilterChange', async () => {
    const view = await readFile(path.join(srcRoot, 'views/MerchantsView.vue'), 'utf8');
    expect(view).toMatch(/v-model:area-id="areaId"/);
    expect(view).toMatch(/v-model:sort="sort"/);
    expect(view).toMatch(/@filter-change="onFilterChange"/);

    const use = await readFile(path.join(__dirname, 'useMerchants.ts'), 'utf8');
    expect(use).toMatch(/onFilterChange/);
    expect(use).toMatch(/page\.value\s*=\s*1/);
  });
});
