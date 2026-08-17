import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const viewsDir = path.resolve(__dirname);

describe('order gap-center read-only surfaces', () => {
  it('does not expose delivery mutations', async () => {
    const source = await readFile(path.join(viewsDir, 'DeliveriesView.vue'), 'utf8');

    expect(source).not.toContain('canManageOrders');
    expect(source).not.toContain('createDelivery');
    expect(source).not.toContain('updateDelivery');
    expect(source).not.toContain('bulkShipDeliveries');
    expect(source).not.toContain('<el-dialog');
  });

  it('does not expose card batch or card mutations', async () => {
    const [batches, cards] = await Promise.all([
      readFile(path.join(viewsDir, 'CardBatchesView.vue'), 'utf8'),
      readFile(path.join(viewsDir, 'CardsView.vue'), 'utf8')
    ]);

    expect(batches).not.toContain('canManageOrders');
    expect(batches).not.toContain('createCardBatch');
    expect(batches).not.toContain('<el-dialog');
    expect(cards).not.toContain('canManageOrders');
    expect(cards).not.toContain('activateCard');
    expect(cards).not.toContain('freezeCard');
    expect(cards).not.toContain('redeemCard');
    expect(cards).not.toContain('<el-dialog');
  });
});
