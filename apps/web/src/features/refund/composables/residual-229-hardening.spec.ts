import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → refund → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #229 refund top-merchants pagination', () => {
  it('refund.api getRefundTopMerchants accepts page/pageSize and returns hasMore', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/refund.api.ts'), 'utf8');
    expect(src).toMatch(/getRefundTopMerchants[\s\S]{0,200}page:\s*number/);
    expect(src).toMatch(/getRefundTopMerchants[\s\S]{0,200}pageSize:\s*number/);
    expect(src).toMatch(/hasMore:\s*boolean/);
  });

  it('refund-verify-core paginates top merchants (not hard-coded page=1)', async () => {
    const src = await readFile(path.join(__dirname, 'refund-verify-core.ts'), 'utf8');
    expect(src).toMatch(/merchantPage:\s*ref\(1\)/);
    expect(src).toMatch(/merchantHasMore:\s*ref\(false\)/);
    expect(src).toMatch(/getRefundTopMerchants\(\{[\s\S]{0,160}page:\s*params\.page/);
    expect(src).toMatch(/getRefundTopMerchants\(\{[\s\S]{0,220}window:\s*params\.window/);
    expect(src).toMatch(/params\.hasMore\.value\s*=\s*!!result\.hasMore/);
    expect(src).toMatch(/prevMerchantPage/);
    expect(src).toMatch(/nextMerchantPage/);
    // Must not hard-code page:1 only path as the sole call.
    expect(src).not.toMatch(
      /getRefundTopMerchants\(\{\s*sortBy,\s*page:\s*1,\s*pageSize:\s*20\s*\}\)/
    );
  });

  it('RefundMerchantTable exposes prev/next pager', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/RefundMerchantTable.vue'),
      'utf8'
    );
    expect(src).toMatch(/\$emit\('prev'\)/);
    expect(src).toMatch(/\$emit\('next'\)/);
    expect(src).toMatch(/hasMore/);
  });

  it('RefundVerifyView wires page + prev/next handlers', async () => {
    const src = await readFile(path.join(srcRoot, 'views/RefundVerifyView.vue'), 'utf8');
    expect(src).toMatch(/:page="merchantPage"/);
    expect(src).toMatch(/:has-more="merchantHasMore"/);
    expect(src).toMatch(/@prev="prevMerchantPage"/);
    expect(src).toMatch(/@next="nextMerchantPage"/);
  });
});
