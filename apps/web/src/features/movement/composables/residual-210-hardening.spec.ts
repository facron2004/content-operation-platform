import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → movement → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #210 movement SKU stock/sales timeline drawer', () => {
  it('movement.api exposes getMovementTimeline hitting /movement/skus/:id/timeline', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/movement.api.ts'), 'utf8');
    expect(src).toMatch(/export async function getMovementTimeline/);
    expect(src).toMatch(/\/movement\/skus\/\$\{packageId\}\/timeline/);
  });

  it('useMovementTimeline open fetches getMovementTimeline and stores points', async () => {
    const src = await readFile(path.join(__dirname, 'useMovementTimeline.ts'), 'utf8');
    expect(src).toMatch(/getMovementTimeline\s*\(/);
    expect(src).toMatch(/timeline\.value/);
    expect(src).toMatch(/drawerVisible/);
    expect(src).toMatch(/packageId/);
  });

  it('MovementTimelineDrawer renders date/stock/sales columns', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/MovementTimelineDrawer.vue'),
      'utf8'
    );
    expect(src).toMatch(/el-drawer/);
    expect(src).toMatch(/动销时间线/);
    expect(src).toMatch(/剩余库存/);
    expect(src).toMatch(/销量/);
    expect(src).toMatch(/timeline/);
  });

  it('MovementSkuTable emits timeline + MovementListView wires drawer', async () => {
    const table = await readFile(
      path.join(__dirname, '../components/MovementSkuTable.vue'),
      'utf8'
    );
    expect(table).toMatch(/\$emit\('timeline',\s*row\)/);
    expect(table).toMatch(/时间线/);

    const view = await readFile(path.join(srcRoot, 'views/MovementListView.vue'), 'utf8');
    expect(view).toMatch(/MovementTimelineDrawer/);
    expect(view).toMatch(/useMovementTimeline/);
    expect(view).toMatch(/@timeline="openTimeline"/);
    expect(view).toMatch(/:timeline="timelinePoints"/);
  });
});
