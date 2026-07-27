import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → gmv → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #230 GMV top-merchants pagination', () => {
  it('gmv.api getGmvByMerchant accepts page/pageSize and returns hasMore', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/gmv.api.ts'), 'utf8');
    expect(src).toMatch(/getGmvByMerchant\([\s\S]{0,200}page\s*=\s*1/);
    expect(src).toMatch(/getGmvByMerchant\([\s\S]{0,240}pageSize\s*=\s*20/);
    expect(src).toMatch(/hasMore:\s*boolean/);
  });

  it('gmv-cockpit-core paginates top merchants (not hard-coded page=1)', async () => {
    const src = await readFile(path.join(__dirname, 'gmv-cockpit-core.ts'), 'utf8');
    expect(src).toMatch(/merchantPage:\s*ref\(1\)/);
    expect(src).toMatch(/merchantHasMore:\s*ref\(false\)/);
    expect(src).toMatch(/getGmvByMerchant\(params\.sort,\s*params\.page,\s*params\.pageSize/);
    expect(src).toMatch(/params\.hasMore\.value\s*=\s*!!result\.hasMore/);
    // Must not hard-code page 1 only path as the sole call.
    expect(src).not.toMatch(/getGmvByMerchant\([^,]+,\s*1,\s*20/);
  });

  it('gmv-cockpit-ops exposes prev/next merchant page handlers', async () => {
    const src = await readFile(path.join(__dirname, 'gmv-cockpit-ops.ts'), 'utf8');
    expect(src).toMatch(/prevMerchantPage/);
    expect(src).toMatch(/nextMerchantPage/);
    expect(src).toMatch(/loadTopMerchants:\s*\(\)\s*=>\s*loadTopMerchants\(true\)/);
  });

  it('GmvTopMerchantsTable + View wire page + prev/next', async () => {
    const table = await readFile(
      path.join(__dirname, '../components/GmvTopMerchantsTable.vue'),
      'utf8'
    );
    expect(table).toMatch(/\$emit\('prev'\)/);
    expect(table).toMatch(/\$emit\('next'\)/);
    expect(table).toMatch(/hasMore/);

    const view = await readFile(path.join(srcRoot, 'views/GmvCockpitView.vue'), 'utf8');
    expect(view).toMatch(/:merchant-page="merchantPage"/);
    expect(view).toMatch(/:merchant-has-more="merchantHasMore"/);
    expect(view).toMatch(/@merchants-prev="prevMerchantPage"/);
    expect(view).toMatch(/@merchants-next="nextMerchantPage"/);
  });
});
