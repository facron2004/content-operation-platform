import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';
import type {
  UnmatchedOrder,
  UnmatchedOrdersResponse
} from '../../../services/api/attribution.api';

const mocks = vi.hoisted(() => ({
  getUnmatchedOrders: vi.fn(),
  manualBindAttribution: vi.fn(),
  recomputeAttribution: vi.fn(),
  confirm: vi.fn(),
  messageWarning: vi.fn(),
  messageSuccess: vi.fn(),
  messageError: vi.fn()
}));

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return { ...actual, onMounted: () => undefined };
});

vi.mock('../../../services/api', () => ({
  api: {
    getUnmatchedOrders: mocks.getUnmatchedOrders,
    manualBindAttribution: mocks.manualBindAttribution,
    recomputeAttribution: mocks.recomputeAttribution
  }
}));

vi.mock('../../../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

vi.mock('../../../stores/role', () => ({
  useRoleStore: () => ({ permissions: ['attribution:manage'] })
}));

vi.mock('element-plus', () => ({
  ElMessage: {
    warning: mocks.messageWarning,
    success: mocks.messageSuccess,
    error: mocks.messageError
  },
  ElMessageBox: { confirm: mocks.confirm }
}));

import { useAttributionPage } from './useAttributionPage';

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

function order(orderId: string): UnmatchedOrder {
  return {
    orderId,
    memberId: 'member-1',
    packageId: 'package-1',
    orderAmountFen: 1000,
    paidAmountFen: 900,
    orderTime: '2026-08-05 10:00:00',
    status: 'paid'
  };
}

function ordersResponse(orderId: string): UnmatchedOrdersResponse {
  return {
    items: [order(orderId)],
    total: 1,
    page: 1,
    pageSize: 20,
    dateFrom: '2026-05-07',
    dateTo: '2026-08-05'
  };
}

function resetMocks() {
  mocks.getUnmatchedOrders.mockReset().mockResolvedValue(ordersResponse('default'));
  mocks.manualBindAttribution.mockReset().mockResolvedValue({ success: true });
  mocks.recomputeAttribution.mockReset().mockResolvedValue({ success: true, processedTasks: 1 });
  mocks.confirm.mockReset().mockResolvedValue(true);
  mocks.messageWarning.mockReset();
  mocks.messageSuccess.mockReset();
  mocks.messageError.mockReset();
}

describe('attribution page request lifecycle', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('keeps the latest unmatched-order page when an earlier response resolves late', async () => {
    const first = createDeferred<UnmatchedOrdersResponse>();
    const second = createDeferred<UnmatchedOrdersResponse>();
    mocks.getUnmatchedOrders
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const page = scope.run(() => useAttributionPage())!;

    const firstLoad = page.load();
    const secondLoad = page.load();
    second.resolve(ordersResponse('new-order'));
    await secondLoad;
    first.reject(new Error('stale failure'));
    await firstLoad;

    expect(page.orders.value[0]?.orderId).toBe('new-order');
    expect(page.loadError.value).toBeNull();
    expect(page.loading.value).toBe(false);
  });

  it('ignores late list data and blocks new requests after scope disposal', async () => {
    const pending = createDeferred<UnmatchedOrdersResponse>();
    mocks.getUnmatchedOrders.mockReset().mockReturnValue(pending.promise);
    scope = effectScope();
    const page = scope.run(() => useAttributionPage())!;
    const load = page.load();

    scope.stop();
    pending.resolve(ordersResponse('late-order'));
    await load;
    await page.load();

    expect(page.orders.value).toEqual([]);
    expect(page.loading.value).toBe(false);
    expect(mocks.getUnmatchedOrders).toHaveBeenCalledTimes(1);
  });

  it('does not complete a manual bind or reload after scope disposal', async () => {
    const pending = createDeferred<{ success: true }>();
    mocks.manualBindAttribution.mockReset().mockReturnValue(pending.promise);
    scope = effectScope();
    const page = scope.run(() => useAttributionPage())!;
    page.openBind(order('order-1'));
    page.setBindTaskId('task-1');
    const bind = page.manualBind();

    scope.stop();
    pending.resolve({ success: true });
    await bind;

    expect(page.bindDialogVisible.value).toBe(true);
    expect(page.actionLoading.value).toBe(false);
    expect(mocks.messageSuccess).not.toHaveBeenCalled();
    expect(mocks.getUnmatchedOrders).not.toHaveBeenCalled();
  });

  it('keeps a failed manual bind available for retry and clears the action error', async () => {
    mocks.manualBindAttribution
      .mockRejectedValueOnce(new Error('bind unavailable'))
      .mockResolvedValueOnce({ success: true });
    scope = effectScope();
    const page = scope.run(() => useAttributionPage())!;
    page.openBind(order('order-1'));
    page.setBindTaskId('task-1');

    await page.manualBind();

    expect(page.actionError.value).toBe('手工归因失败，请检查任务与订单是否匹配');
    expect(page.bindDialogVisible.value).toBe(true);

    await page.manualBind();

    expect(page.actionError.value).toBeNull();
    expect(page.bindDialogVisible.value).toBe(false);
  });

  it('blocks duplicate manual binds and clears a failed recompute on retry', async () => {
    const pendingBind = createDeferred<{ success: true }>();
    mocks.manualBindAttribution.mockReset().mockReturnValue(pendingBind.promise);
    scope = effectScope();
    const page = scope.run(() => useAttributionPage())!;
    page.openBind(order('order-1'));
    page.setBindTaskId('task-1');

    const firstBind = page.manualBind();
    const duplicateBind = page.manualBind();
    await duplicateBind;
    expect(mocks.manualBindAttribution).toHaveBeenCalledTimes(1);

    pendingBind.resolve({ success: true });
    await firstBind;

    mocks.recomputeAttribution
      .mockRejectedValueOnce(new Error('recompute unavailable'))
      .mockResolvedValueOnce({ success: true, processedTasks: 2 });
    await page.recompute();
    expect(page.actionError.value).toBe('归因重算失败，请稍后重试');

    await page.recompute();
    expect(page.actionError.value).toBeNull();
  });

  it('does not publish a recompute result after scope disposal', async () => {
    const pending = createDeferred<{ success: true; processedTasks: number }>();
    mocks.recomputeAttribution.mockReset().mockReturnValue(pending.promise);
    scope = effectScope();
    const page = scope.run(() => useAttributionPage())!;
    const recompute = page.recompute();

    scope.stop();
    pending.resolve({ success: true, processedTasks: 2 });
    await recompute;

    expect(page.actionLoading.value).toBe(false);
    expect(mocks.messageSuccess).not.toHaveBeenCalled();
    expect(mocks.getUnmatchedOrders).not.toHaveBeenCalled();
  });
});
