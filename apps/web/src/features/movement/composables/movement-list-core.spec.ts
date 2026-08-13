import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';
import type {
  MovementListResponse,
  MovementSkuRow,
  MovementTodayPayload
} from '../../../services/api/movement.api';

const mocks = vi.hoisted(() => ({
  getMovementToday: vi.fn(),
  getMovementStagnant: vi.fn(),
  getMovementMoving: vi.fn()
}));

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return { ...actual, onMounted: () => undefined };
});

vi.mock('../../../services/api/movement.api', () => ({
  getMovementToday: mocks.getMovementToday,
  getMovementStagnant: mocks.getMovementStagnant,
  getMovementMoving: mocks.getMovementMoving
}));

vi.mock('../../../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

import { bindMovementListLoaders, createMovementListState } from './movement-list-core';

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

function row(packageId: string): MovementSkuRow {
  return {
    packageId,
    packageName: packageId,
    merchantId: `${packageId}-merchant`,
    merchantName: `${packageId}-merchant`,
    areaName: null,
    category: 'category',
    salePrice: 100,
    stockLeft: 4,
    stockTotal: 5,
    lastSalesDate: '2026-08-04',
    daysSinceLastSale: 1,
    staleBucket: 'stale_7d',
    recent30dSalesQty: 2,
    recent30dSalesAmount: 200
  };
}

function listFor(packageId: string): MovementListResponse {
  return {
    items: [row(packageId)],
    pagination: { page: 1, pageSize: 20, hasMore: false },
    limit: 20,
    truncated: false
  };
}

function todayFor(date: string): MovementTodayPayload {
  return {
    date,
    activeSkus: 1,
    movingSkus: 1,
    stagnantSkus: 0,
    movingRate: 1,
    bucketDistribution: [],
    updatedAt: `${date}T00:00:00.000Z`
  };
}

describe('movement list request lifecycle', () => {
  let scope: EffectScope | undefined;

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('keeps the latest list when an earlier response resolves late', async () => {
    const first = createDeferred<MovementListResponse>();
    const second = createDeferred<MovementListResponse>();
    mocks.getMovementStagnant
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const state = createMovementListState();
    const loaders = scope.run(() => bindMovementListLoaders(state))!;

    const firstLoad = loaders.loadList();
    const secondLoad = loaders.loadList();
    second.resolve(listFor('package-b'));
    await secondLoad;
    first.resolve(listFor('package-a'));
    await firstLoad;

    expect(state.rows.value[0]?.packageId).toBe('package-b');
    expect(state.listLoading.value).toBe(false);
  });

  it('does not let a stale list error replace the latest successful list', async () => {
    const first = createDeferred<MovementListResponse>();
    const second = createDeferred<MovementListResponse>();
    mocks.getMovementStagnant
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const state = createMovementListState();
    const loaders = scope.run(() => bindMovementListLoaders(state))!;

    const firstLoad = loaders.loadList();
    const secondLoad = loaders.loadList();
    second.resolve(listFor('package-b'));
    await secondLoad;
    first.reject(new Error('stale failure'));
    await firstLoad;

    expect(state.rows.value[0]?.packageId).toBe('package-b');
    expect(state.loadError.value).toBeNull();
    expect(state.listLoading.value).toBe(false);
  });

  it('protects the latest KPI and page loading state across reloads', async () => {
    const firstToday = createDeferred<MovementTodayPayload>();
    const secondToday = createDeferred<MovementTodayPayload>();
    mocks.getMovementToday
      .mockReset()
      .mockImplementationOnce(() => firstToday.promise)
      .mockImplementationOnce(() => secondToday.promise);
    mocks.getMovementStagnant.mockReset().mockResolvedValue(listFor('package-a'));
    scope = effectScope();
    const state = createMovementListState();
    const loaders = scope.run(() => bindMovementListLoaders(state))!;

    const firstReload = loaders.reload();
    const secondReload = loaders.reload();
    secondToday.resolve(todayFor('2026-08-05'));
    await secondReload;
    firstToday.reject(new Error('stale KPI failure'));
    await firstReload;

    expect(state.today.value?.date).toBe('2026-08-05');
    expect(state.loading.value).toBe(false);
  });

  it('only forwards force to both reads for an explicit manual reload', async () => {
    mocks.getMovementToday.mockReset().mockResolvedValue(todayFor('2026-08-05'));
    mocks.getMovementStagnant.mockReset().mockResolvedValue(listFor('package-a'));
    mocks.getMovementMoving.mockReset();
    scope = effectScope();
    const state = createMovementListState();
    state.kpiDate.value = '2026-08-05';
    const loaders = scope.run(() => bindMovementListLoaders(state))!;

    await loaders.reload();
    await loaders.reload(true);

    expect(mocks.getMovementToday).toHaveBeenNthCalledWith(1, '2026-08-05', false);
    expect(mocks.getMovementToday).toHaveBeenNthCalledWith(2, '2026-08-05', true);
    expect(mocks.getMovementStagnant.mock.calls[0]?.[1]).toBe(false);
    expect(mocks.getMovementStagnant.mock.calls[1]?.[1]).toBe(true);
  });

  it('ignores late list data and blocks new requests after scope disposal', async () => {
    const pending = createDeferred<MovementListResponse>();
    mocks.getMovementStagnant.mockReset().mockReturnValue(pending.promise);
    scope = effectScope();
    const state = createMovementListState();
    const loaders = scope.run(() => bindMovementListLoaders(state))!;
    const load = loaders.loadList();

    scope.stop();
    pending.resolve(listFor('late-package'));
    await load;
    await loaders.loadList();

    expect(state.rows.value).toEqual([]);
    expect(state.listLoading.value).toBe(false);
    expect(mocks.getMovementStagnant).toHaveBeenCalledTimes(1);
  });
});
