import { describe, expect, it } from 'vitest';
import { dashboardOpsCacheKey, type DashboardOpsScope } from '../src/content/dashboard.service';

describe('residual #64 zero-sales listSkus TTL + getOrLoad', () => {
  it('service caches SKU pages via skusCache.getOrLoad', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const service = await fs.readFile(
      path.join(__dirname, '..', 'src', 'zero-sales', 'zero-sales.service.ts'),
      'utf8'
    );
    const list = await fs.readFile(
      path.join(__dirname, '..', 'src', 'zero-sales', 'zero-sales-list.ts'),
      'utf8'
    );
    expect(service).toContain('skusCache');
    expect(service).toContain('ZERO_SALES_SKUS_TTL_MS');
    expect(service).toMatch(/skusCache\.getOrLoad/);
    expect(service).toContain('zeroSalesSkusCacheKey');
    expect(service).toContain('computeZeroSalesSkus');
    // Export still single-flights and reuses the same coalesce path.
    expect(service).toContain('exportRunning');
    expect(service).toMatch(/listSkusForExport[\s\S]*skusCache\.getOrLoad/);
    expect(list).toContain('zeroSalesSkusCacheKey');
    expect(list).toContain('computeZeroSalesSkus');
    // Page-less key (residual #74) — interactive/export share one head.
    expect(list).not.toMatch(/String\(page\)/);
    expect(list).not.toMatch(/String\(pageSize\)/);
  });
});

describe('residual #64 dashboard opsCache TTL + scoped keys', () => {
  it('service uses opsCache.getOrLoad for today + performance', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const service = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'dashboard-operations.service.ts'),
      'utf8'
    );
    const controller = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'dashboard.controller.ts'),
      'utf8'
    );
    expect(service).toContain('opsCache');
    expect(service).toContain('DASHBOARD_OPS_TTL_MS');
    expect(service).toMatch(/opsCache\.getOrLoad/);
    expect(service).toContain('dashboardOpsCacheKey');
    expect(service).toContain('computeTodayOperationConsole');
    expect(service).toContain('computePerformance');
    // Controller must pass JWT scope into the service (not just role).
    expect(controller).toContain('opsScopeFromReq');
    expect(controller).toMatch(/getTodayOperationConsole\([\s\S]*opsScopeFromReq\(req\)/);
  });

  it('dashboardOpsCacheKey includes sorted areaIds/merchantIds', () => {
    const today = '2026-07-23';
    const a: DashboardOpsScope = {
      areaIds: ['b', 'a'],
      merchantIds: ['m2', 'm1']
    };
    const b: DashboardOpsScope = {
      areaIds: ['a', 'b'],
      merchantIds: ['m1', 'm2']
    };
    const empty: DashboardOpsScope = {};
    const keyA = dashboardOpsCacheKey('today', today, 'operator', a);
    const keyB = dashboardOpsCacheKey('today', today, 'operator', b);
    const keyEmpty = dashboardOpsCacheKey('today', today, 'operator', empty);
    const keyOtherScope = dashboardOpsCacheKey('today', today, 'operator', {
      areaId: 'area-x'
    });
    // Order of ids must not matter.
    expect(keyA).toBe(keyB);
    // Different scopes must not collide (cross-tenant leak prevention).
    expect(keyA).not.toBe(keyEmpty);
    expect(keyA).not.toBe(keyOtherScope);
    // Scope fragments appear in the key.
    expect(keyA).toContain('a,b');
    expect(keyA).toContain('m1,m2');
    expect(keyA).toMatch(/^ops:today\|/);
    // Performance keys stay platform-wide (unrestricted-only endpoint).
    const perf = dashboardOpsCacheKey('performance', today);
    expect(perf).toMatch(/^ops:performance\|/);
    expect(perf).toContain(today);
  });
});
