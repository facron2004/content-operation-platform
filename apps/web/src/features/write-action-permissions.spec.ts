import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canManageAttribution,
  canManageMerchants,
  canManageOrders,
  canWritePackages
} from './write-action-permissions';

const webSrc = path.resolve(__dirname, '..');

describe('write action permissions', () => {
  it('maps frontend write capabilities to the endpoint permissions', () => {
    expect(canManageAttribution(['auditor'], ['attribution:manage'])).toBe(false);
    expect(canManageAttribution(['admin'], ['attribution:read'])).toBe(false);
    expect(canManageAttribution(['platform_operator'], ['attribution:manage'])).toBe(true);
    expect(canWritePackages(['admin'], ['packages:write'])).toBe(true);
    expect(canWritePackages(['platform_operator'], ['packages:write'])).toBe(true);
    expect(canWritePackages(['auditor'], ['packages:write'])).toBe(false);
    expect(canWritePackages([], ['packages:write'])).toBe(false);
    expect(canWritePackages(['admin'], ['packages:read', 'orders:manage'])).toBe(false);
    expect(canManageOrders(['platform_operator'], ['orders:manage'])).toBe(true);
    expect(canManageOrders(['auditor'], ['orders:manage'])).toBe(false);
    expect(canManageOrders(['admin'], ['analytics:read', 'packages:write'])).toBe(false);
    expect(canManageMerchants(['admin'], ['merchant:manage'])).toBe(true);
    expect(canManageMerchants(['platform_operator'], ['merchant:manage'])).toBe(true);
    expect(canManageMerchants(['auditor'], ['merchant:manage'])).toBe(false);
    expect(canManageMerchants([], ['merchant:manage'])).toBe(false);
    expect(canManageMerchants(['platform_operator'], ['merchant:read'])).toBe(false);
  });

  it('keeps product edits gated and keeps product/order pages read-only where required', async () => {
    const [product, order] = await Promise.all([
      readFile(path.join(webSrc, 'views/ProductCenterView.vue'), 'utf8'),
      readFile(path.join(webSrc, 'views/OrderCenterView.vue'), 'utf8')
    ]);

    expect(product).toContain('v-if="canWritePackages"');
    expect(product).toContain('v-if="canWritePackages && change.status === \'requested\'"');
    expect(product.match(/if \(!canWritePackages\.value\) return;/g)).toHaveLength(5);
    expect(product).not.toContain('调整库存');
    expect(product).not.toContain('inventory-adjustments');
    expect(order).not.toContain('canManageOrders');
    expect(order).not.toContain('@click="openVerifyDialog"');
    expect(order).not.toContain('@click="openRefundDialog"');
    expect(order).toContain('订单中心仅同步并展示');
  });

  it('gates merchant and package gap-center write surfaces', async () => {
    const [stores, scores, crm, combinations] = await Promise.all([
      readFile(path.join(webSrc, 'views/StoresView.vue'), 'utf8'),
      readFile(path.join(webSrc, 'views/MerchantScoresView.vue'), 'utf8'),
      readFile(path.join(webSrc, 'views/CrmLeadsView.vue'), 'utf8'),
      readFile(path.join(webSrc, 'views/PackageCombinationsView.vue'), 'utf8')
    ]);

    expect(stores.match(/v-if="canManageMerchants"/g)).toHaveLength(2);
    expect(stores.match(/if \(!canManageMerchants\.value\) return;/g)).toHaveLength(2);
    expect(scores).toContain('<el-table-column v-if="canManageMerchants" label="操作"');
    expect(scores.match(/if \(!canManageMerchants\.value\) return;/g)).toHaveLength(1);
    expect(crm).toContain(':draggable="canManageMerchants"');
    expect(crm.match(/:disabled="!canManageMerchants"/g)).toHaveLength(4);
    expect(crm.match(/if \(!canManageMerchants\.value/g)).toHaveLength(7);
    expect(combinations.match(/v-if="canWritePackages"/g)).toHaveLength(3);
    expect(combinations.match(/if \(!canWritePackages\.value\) return;/g)).toHaveLength(3);
  });
});
