import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → zero-sales → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #211 zero-sales SKU stock/sales timeline drawer', () => {
  it('zero-sales.api exposes getZeroSalesTimeline hitting /zero-sales/skus/:id/timeline', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/zero-sales.api.ts'), 'utf8');
    expect(src).toMatch(/export async function getZeroSalesTimeline/);
    expect(src).toMatch(/\/zero-sales\/skus\/\$\{packageId\}\/timeline/);
  });

  it('useZeroSalesTimeline open fetches getZeroSalesTimeline and stores points', async () => {
    const src = await readFile(path.join(__dirname, 'useZeroSalesTimeline.ts'), 'utf8');
    expect(src).toMatch(/getZeroSalesTimeline\s*\(/);
    expect(src).toMatch(/timeline\.value/);
    expect(src).toMatch(/drawerVisible/);
    expect(src).toMatch(/packageId/);
  });

  it('ZeroSalesTimelineDrawer renders date/stock/sales columns', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/ZeroSalesTimelineDrawer.vue'),
      'utf8'
    );
    expect(src).toMatch(/el-drawer/);
    expect(src).toMatch(/零动销时间线/);
    expect(src).toMatch(/剩余库存/);
    expect(src).toMatch(/销量/);
    expect(src).toMatch(/timeline/);
  });

  it('ZeroSalesSkuTable emits timeline + PageBody wires drawer', async () => {
    const table = await readFile(
      path.join(__dirname, '../components/ZeroSalesSkuTable.vue'),
      'utf8'
    );
    expect(table).toMatch(/emit\('timeline',\s*row\)/);
    expect(table).toMatch(/时间线/);

    const body = await readFile(
      path.join(__dirname, '../components/ZeroSalesPageBody.vue'),
      'utf8'
    );
    expect(body).toMatch(/ZeroSalesTimelineDrawer/);
    expect(body).toMatch(/useZeroSalesTimeline/);
    expect(body).toMatch(/@timeline="openTimeline"/);
    expect(body).toMatch(/:timeline="timelinePoints"/);

    const tabs = await readFile(path.join(__dirname, '../components/ZeroSalesTabs.vue'), 'utf8');
    expect(tabs).toMatch(/@timeline="\$emit\('timeline'/);
  });
});
