import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref, type EffectScope } from 'vue';
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import type {
  MerchantCompetitorsResponse,
  MerchantListResponse,
  MerchantProfile,
  MerchantSkuListResponse,
  MerchantTrendResponse
} from '../../../services/api/merchant.api';

const mocks = vi.hoisted(() => ({
  listMerchants: vi.fn(),
  getMerchantProfile: vi.fn(),
  getMerchantTrend: vi.fn(),
  getMerchantSkus: vi.fn(),
  getMerchantCompetitors: vi.fn(),
  route: { query: {} },
  router: { replace: vi.fn(), push: vi.fn() },
  mounted: undefined as (() => void) | undefined
}));

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return {
    ...actual,
    onMounted: (callback: () => void) => {
      mocks.mounted = callback;
    }
  };
});

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => mocks.router
}));

vi.mock('../../../services/api/merchant.api', () => ({
  listMerchants: mocks.listMerchants,
  getMerchantProfile: mocks.getMerchantProfile,
  getMerchantTrend: mocks.getMerchantTrend,
  getMerchantSkus: mocks.getMerchantSkus,
  getMerchantCompetitors: mocks.getMerchantCompetitors
}));

vi.mock('../../../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

import { bindMerchantRoute } from './merchant-ui';
import { useMerchants } from './useMerchants';

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

function listFor(merchantId: string): MerchantListResponse {
  return {
    items: [
      {
        merchantId,
        merchantName: merchantId,
        areaId: null,
        areaName: null,
        totalSku: 2,
        stale30SkuCount: 1,
        stale30Ratio: 0.5,
        totalGmv30d: 100
      }
    ],
    pagination: { page: 1, pageSize: 20, hasMore: false },
    limit: 20,
    truncated: false
  };
}

function profileFor(merchantId: string): MerchantProfile {
  return {
    merchantId,
    merchantName: merchantId,
    areaId: null,
    areaName: null,
    totalSku: 2,
    stale30SkuCount: 1,
    stale30Ratio: 0.5
  };
}

function trendFor(merchantId: string): MerchantTrendResponse {
  return {
    merchantId,
    days: 60,
    trend: []
  };
}

function skusFor(merchantId: string): MerchantSkuListResponse {
  return {
    merchantId,
    count: 0,
    items: [],
    days: 60,
    limit: 100,
    truncated: false
  };
}

function competitorsFor(merchantId: string): MerchantCompetitorsResponse {
  return {
    merchantId,
    competitors: [],
    limit: 20,
    matched: 0,
    truncated: false
  };
}

function resetMocks() {
  mocks.mounted = undefined;
  mocks.listMerchants.mockReset().mockResolvedValue(listFor('default'));
  mocks.getMerchantProfile
    .mockReset()
    .mockImplementation((merchantId: string) => Promise.resolve(profileFor(merchantId)));
  mocks.getMerchantTrend
    .mockReset()
    .mockImplementation((merchantId: string) => Promise.resolve(trendFor(merchantId)));
  mocks.getMerchantSkus
    .mockReset()
    .mockImplementation((merchantId: string) => Promise.resolve(skusFor(merchantId)));
  mocks.getMerchantCompetitors
    .mockReset()
    .mockImplementation((merchantId: string) => Promise.resolve(competitorsFor(merchantId)));
}

describe('merchant page request lifecycle', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('keeps the latest list when an earlier response resolves late', async () => {
    const first = createDeferred<MerchantListResponse>();
    const second = createDeferred<MerchantListResponse>();
    mocks.listMerchants
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const page = scope.run(() => useMerchants())!;

    const firstLoad = page.reloadList();
    const secondLoad = page.reloadList();
    second.resolve(listFor('merchant-new'));
    await secondLoad;
    first.reject(new Error('stale list failure'));
    await firstLoad;

    expect(page.merchants.value[0]?.merchantId).toBe('merchant-new');
    expect(page.loadError.value).toBeNull();
    expect(page.loading.value).toBe(false);
  });

  it('keeps the latest detail when an earlier merchant load fails late', async () => {
    const first = createDeferred<MerchantProfile>();
    const second = createDeferred<MerchantProfile>();
    mocks.getMerchantProfile
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const page = scope.run(() => useMerchants())!;
    page.selectedMerchantId.value = 'merchant';

    const firstLoad = page.setDetailDays(60);
    const secondLoad = page.setDetailDays(90);
    second.resolve(profileFor('merchant-new'));
    await secondLoad;
    first.reject(new Error('stale detail failure'));
    await firstLoad;

    expect(page.profile.value?.merchantId).toBe('merchant-new');
    expect(page.loadError.value).toBeNull();
    expect(page.detailLoading.value).toBe(false);
  });

  it('clears a list error after a successful retry without affecting detail errors', async () => {
    mocks.listMerchants
      .mockReset()
      .mockRejectedValueOnce(new Error('list failure'))
      .mockResolvedValueOnce(listFor('merchant-retried'));
    scope = effectScope();
    const page = scope.run(() => useMerchants())!;

    await page.reloadList();
    expect(page.listError.value).toBe('加载商家列表失败');
    expect(page.loadError.value).toBe('加载商家列表失败');

    await page.reloadList();
    expect(page.listError.value).toBeNull();
    expect(page.loadError.value).toBeNull();
    expect(page.merchants.value[0]?.merchantId).toBe('merchant-retried');
  });

  it('clears a detail error after a successful retry without hiding list errors', async () => {
    mocks.listMerchants.mockReset().mockRejectedValue(new Error('list failure'));
    mocks.getMerchantProfile
      .mockReset()
      .mockRejectedValueOnce(new Error('detail failure'))
      .mockResolvedValueOnce(profileFor('merchant-retried'));
    scope = effectScope();
    const page = scope.run(() => useMerchants())!;
    page.selectedMerchantId.value = 'merchant';

    await page.reloadList();
    await page.setDetailDays(60);
    expect(page.listError.value).toBe('加载商家列表失败');
    expect(page.detailError.value).toBe('加载商家详情失败');

    await page.setDetailDays(90);
    expect(page.listError.value).toBe('加载商家列表失败');
    expect(page.detailError.value).toBeNull();
    expect(page.loadError.value).toBe('加载商家列表失败');
    expect(page.profile.value?.merchantId).toBe('merchant-retried');
  });

  it('forces only the manual reload through list, profile, and SKU cache boundaries', async () => {
    scope = effectScope();
    const page = scope.run(() => useMerchants())!;

    mocks.mounted?.();
    await vi.waitFor(() => expect(mocks.listMerchants).toHaveBeenCalled());
    expect(mocks.listMerchants.mock.calls.at(-1)?.[0]).not.toHaveProperty('force');
    page.search.value = 'merchant';
    await page.onFilterChange();
    expect(mocks.listMerchants.mock.calls.at(-1)?.[0]).not.toHaveProperty('force');
    page.hasMore.value = true;
    const callsBeforePaging = mocks.listMerchants.mock.calls.length;
    page.nextPage();
    await vi.waitFor(() =>
      expect(mocks.listMerchants).toHaveBeenCalledTimes(callsBeforePaging + 1)
    );
    expect(mocks.listMerchants.mock.calls.at(-1)?.[0]).not.toHaveProperty('force');

    page.selectedMerchantId.value = 'merchant';
    await page.setDetailDays(60);
    expect(mocks.getMerchantProfile).toHaveBeenLastCalledWith('merchant', false);
    expect(mocks.getMerchantSkus).toHaveBeenLastCalledWith('merchant', 60, false);

    await page.reload();
    expect(mocks.listMerchants.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ force: true })
    );
    expect(mocks.getMerchantProfile).toHaveBeenLastCalledWith('merchant', true);
    expect(mocks.getMerchantSkus).toHaveBeenLastCalledWith('merchant', 60, true);
  });

  it('ignores late list data and blocks new requests after scope disposal', async () => {
    const pending = createDeferred<MerchantListResponse>();
    mocks.listMerchants.mockReset().mockReturnValue(pending.promise);
    scope = effectScope();
    const page = scope.run(() => useMerchants())!;
    const load = page.reloadList();

    scope.stop();
    pending.resolve(listFor('late-merchant'));
    await load;
    await page.reloadList();

    expect(page.merchants.value).toEqual([]);
    expect(page.loading.value).toBe(false);
    expect(mocks.listMerchants).toHaveBeenCalledTimes(1);
  });

  it('ignores late detail data and blocks new requests after scope disposal', async () => {
    const pending = createDeferred<MerchantProfile>();
    mocks.getMerchantProfile.mockReset().mockReturnValue(pending.promise);
    scope = effectScope();
    const page = scope.run(() => useMerchants())!;
    page.selectedMerchantId.value = 'merchant';
    const load = page.setDetailDays(60);

    scope.stop();
    pending.resolve(profileFor('late-merchant'));
    await load;
    await page.setDetailDays(90);

    expect(page.profile.value).toBeNull();
    expect(page.detailLoading.value).toBe(false);
    expect(mocks.getMerchantProfile).toHaveBeenCalledTimes(1);
  });

  it('handles an initial route-load rejection without an unhandled promise', async () => {
    const reloadList = vi.fn().mockRejectedValue(new Error('initial list failure'));
    const reloadDetail = vi.fn().mockResolvedValue(undefined);
    const selectedMerchantId = ref<string | undefined>();
    const selectedMerchant = ref<{ merchantId: string } | null>(null);
    const merchants = ref<Array<{ merchantId: string }>>([]);
    const unhandled = vi.fn();
    const onUnhandled = (reason: unknown) => unhandled(reason);

    scope = effectScope();
    scope.run(() =>
      bindMerchantRoute({
        route: mocks.route as unknown as RouteLocationNormalizedLoaded,
        selectedMerchantId,
        selectedMerchant,
        merchants,
        reloadList,
        reloadDetail
      })
    );

    expect(mocks.mounted).toBeDefined();
    process.on('unhandledRejection', onUnhandled);
    mocks.mounted?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    process.off('unhandledRejection', onUnhandled);

    expect(reloadList).toHaveBeenCalledTimes(1);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
