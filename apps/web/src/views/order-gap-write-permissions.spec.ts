import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { canManageOrders } from '../features/write-action-permissions';

const viewsDir = path.resolve(__dirname);

describe('order gap-center write permissions', () => {
  it('requires a command role and orders:manage permission', () => {
    expect(canManageOrders(['admin'], ['orders:manage'])).toBe(true);
    expect(canManageOrders(['platform_operator'], ['orders:manage'])).toBe(true);
    expect(canManageOrders(['auditor'], ['orders:manage'])).toBe(false);
    expect(canManageOrders(['admin'], ['orders:read'])).toBe(false);
    expect(canManageOrders([], ['orders:manage'])).toBe(false);
  });

  it('hides delivery mutations and fails closed before and after prompts', async () => {
    const source = await readFile(path.join(viewsDir, 'DeliveriesView.vue'), 'utf8');

    expect(source).toContain('<el-table-column v-if="canManageOrders" type="selection"');
    expect(source).toContain('<el-table-column v-if="canManageOrders" label="操作"');
    expect(source.match(/<el-dialog v-if="canManageOrders"/g)).toHaveLength(2);
    expect(source.match(/if \(!canManageOrders\.value\) return;/g)).toHaveLength(5);
    expect(source).toContain('if (!canManageOrders.value || !company) return;');
    expect(source).toContain('if (!canManageOrders.value || !trackingPrefix) return;');
  });

  it('hides card batch and card mutations and guards every handler', async () => {
    const [batches, cards] = await Promise.all([
      readFile(path.join(viewsDir, 'CardBatchesView.vue'), 'utf8'),
      readFile(path.join(viewsDir, 'CardsView.vue'), 'utf8')
    ]);

    expect(batches.match(/<el-dialog v-if="canManageOrders"/g)).toHaveLength(2);
    expect(batches.match(/if \(!canManageOrders\.value\) return;/g)).toHaveLength(2);
    expect(cards).toContain('<el-table-column v-if="canManageOrders" label="操作"');
    expect(cards).toContain('<el-dialog v-if="canManageOrders"');
    expect(cards.match(/if \(!canManageOrders\.value\) return;/g)).toHaveLength(3);
  });
});
