import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ZeroSalesListResponse,
  ZeroSalesMerchantRow,
  ZeroSalesSkuRow
} from '../../../services/api/zero-sales.api';

const mocks = vi.hoisted(() => ({
  getZeroSalesMerchants: vi.fn(),
  getZeroSalesSkus: vi.fn()
}));

vi.mock('../../../services/api/zero-sales.api', () => ({
  getZeroSalesMerchants: mocks.getZeroSalesMerchants,
  getZeroSalesSkus: mocks.getZeroSalesSkus
}));

vi.mock('../../../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

vi.mock('../../../services/http-client-utils', () => ({
  isRequestCanceled: () => false
}));

import { createZeroSalesLoaders, createZeroSalesState } from './zero-sales-core';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function merchant(merchantId: string): ZeroSalesMerchantRow {
  return {
    merchantId,
    merchantName: merchantId,
    areaName: null,
    areaId: null,
    totalSku: 2,
    staleSkuCount: 1,
    staleGmv30d: 100,
    lastSalesDate: '2026-08-05'
  };
}

function sku(packageId: string): ZeroSalesSkuRow {
  return {
    packageId,
    packageName: packageId,
    merchantId: `${packageId}-merchant`,
    merchantName: `${packageId}-merchant`,
    areaName: 'area',
    category: 'category',
    salePrice: 100,
    stockLeft: 4,
    stockTotal: 5,
    lastSalesDate: '2026-08-05',
    daysSinceLastSale: 7,
    staleBucket: 'stale_7d',
    staleGmv30d: 100,
    staleSalesQty30d: 1
  };
}

function merchantPage(id: string): ZeroSalesListResponse<ZeroSalesMerchantRow> {
  return {
    items: [merchant(id)],
    pagination: { page: 1, pageSize: 20, hasMore: false },
    limit: 20,
    truncated: false
  };
}

function skuPage(id: string): ZeroSalesListResponse<ZeroSalesSkuRow> {
  return {
    items: [sku(id)],
    pagination: { page: 1, pageSize: 50, hasMore: false },
    limit: 50,
    truncated: false
  };
}

function resetMocks() {
  mocks.getZeroSalesMerchants.mockReset().mockResolvedValue(merchantPage('default'));
  mocks.getZeroSalesSkus.mockReset().mockResolvedValue(skuPage('default'));
}

describe('zero sales list request lifecycle', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('keeps the latest merchant page when an earlier response resolves late', async () => {
    const first = createDeferred<ZeroSalesListResponse<ZeroSalesMerchantRow>>();
    const second = createDeferred<ZeroSalesListResponse<ZeroSalesMerchantRow>>();
    mocks.getZeroSalesMerchants
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const state = createZeroSalesState({});
    const loaders = createZeroSalesLoaders(state);

    const firstLoad = loaders.loadMerchants();
    const secondLoad = loaders.loadMerchants();
    second.resolve(merchantPage('merchant-new'));
    await secondLoad;
    first.reject(new Error('stale merchant failure'));
    await firstLoad;

    expect(state.merchantRows.value[0]?.merchantId).toBe('merchant-new');
    expect(state.loadError.value).toBeNull();
    expect(state.merchantLoading.value).toBe(false);
  });

  it('keeps the latest SKU page independently from merchant requests', async () => {
    const first = createDeferred<ZeroSalesListResponse<ZeroSalesSkuRow>>();
    const second = createDeferred<ZeroSalesListResponse<ZeroSalesSkuRow>>();
    mocks.getZeroSalesSkus
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const state = createZeroSalesState({});
    const loaders = createZeroSalesLoaders(state);

    const firstLoad = loaders.loadSkus();
    const secondLoad = loaders.loadSkus();
    second.resolve(skuPage('sku-new'));
    await secondLoad;
    first.resolve(skuPage('sku-old'));
    await firstLoad;

    expect(state.skuRows.value[0]?.packageId).toBe('sku-new');
    expect(state.skuLoading.value).toBe(false);
  });

  it('invalidates a previous tab reload before publishing the current tab', async () => {
    const merchantPending = createDeferred<ZeroSalesListResponse<ZeroSalesMerchantRow>>();
    const skuPending = createDeferred<ZeroSalesListResponse<ZeroSalesSkuRow>>();
    mocks.getZeroSalesMerchants.mockReset().mockReturnValue(merchantPending.promise);
    mocks.getZeroSalesSkus.mockReset().mockReturnValue(skuPending.promise);
    const state = createZeroSalesState({});
    const loaders = createZeroSalesLoaders(state);

    const merchantReload = loaders.reload();
    state.activeTab.value = 'sku';
    const skuReload = loaders.reload();
    skuPending.resolve(skuPage('current-sku'));
    await skuReload;
    merchantPending.resolve(merchantPage('stale-merchant'));
    await merchantReload;

    expect(state.skuRows.value[0]?.packageId).toBe('current-sku');
    expect(state.merchantRows.value).toEqual([]);
    expect(state.loading.value).toBe(false);
  });

  it('ignores late data and blocks new list requests after disposal', async () => {
    const pending = createDeferred<ZeroSalesListResponse<ZeroSalesMerchantRow>>();
    mocks.getZeroSalesMerchants.mockReset().mockReturnValue(pending.promise);
    const state = createZeroSalesState({});
    const loaders = createZeroSalesLoaders(state);
    const load = loaders.loadMerchants();

    loaders.dispose();
    pending.resolve(merchantPage('late-merchant'));
    await load;
    await loaders.loadMerchants();

    expect(state.merchantRows.value).toEqual([]);
    expect(state.merchantLoading.value).toBe(false);
    expect(mocks.getZeroSalesMerchants).toHaveBeenCalledTimes(1);
  });
});
