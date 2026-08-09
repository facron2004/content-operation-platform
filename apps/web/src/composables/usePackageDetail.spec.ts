import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';
import type { PackageDetailResponse } from '@content/shared';

const mocks = vi.hoisted(() => ({
  getPackageDetail: vi.fn(),
  refreshPackageDetail: vi.fn(),
  success: vi.fn(),
  error: vi.fn()
}));

vi.mock('element-plus', () => ({
  ElMessage: { success: mocks.success, error: mocks.error }
}));

vi.mock('../services/api', () => ({
  api: {
    getPackageDetail: mocks.getPackageDetail,
    refreshPackageDetail: mocks.refreshPackageDetail
  }
}));

vi.mock('../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

import { usePackageDetail } from './usePackageDetail';

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

function detailFor(packageId: string, title: string): PackageDetailResponse {
  return {
    success: true,
    data: {
      packageId,
      packageTitle: title,
      fetchedAt: '2026-08-05T00:00:00.000Z',
      sections: [{ title: '套餐内容', items: [{ name: title, quantity: '1' }] }]
    }
  };
}

function refreshFor(packageId: string, title: string): PackageDetailResponse & { message: string } {
  return { ...detailFor(packageId, title), message: `${title} 已刷新` };
}

describe('package detail request lifecycle', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    mocks.getPackageDetail.mockReset();
    mocks.refreshPackageDetail.mockReset();
    mocks.success.mockReset();
    mocks.error.mockReset();
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('ignores late detail data and blocks new reads after scope disposal', async () => {
    const pending = createDeferred<PackageDetailResponse>();
    mocks.getPackageDetail.mockReturnValue(pending.promise);
    scope = effectScope();
    const detail = scope.run(() =>
      usePackageDetail(
        () => undefined,
        () => 'pkg-1'
      )
    )!;

    const load = detail.loadPackageDetail('pkg-1');
    scope.stop();
    pending.resolve(detailFor('pkg-1', 'late'));
    await load;
    await detail.loadPackageDetail('pkg-1');

    expect(detail.packageDetail.value).toBeNull();
    expect(detail.detailLoading.value).toBe(false);
    expect(mocks.getPackageDetail).toHaveBeenCalledTimes(1);
  });

  it('keeps the latest detail response when an earlier package load resolves late', async () => {
    const first = createDeferred<PackageDetailResponse>();
    const second = createDeferred<PackageDetailResponse>();
    mocks.getPackageDetail
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const detail = scope.run(() =>
      usePackageDetail(
        () => undefined,
        () => 'pkg-1'
      )
    )!;

    const firstLoad = detail.loadPackageDetail('pkg-1');
    const secondLoad = detail.loadPackageDetail('pkg-1');
    second.resolve(detailFor('pkg-1', 'latest'));
    await secondLoad;
    first.resolve(detailFor('pkg-1', 'stale'));
    await firstLoad;

    expect(detail.packageDetail.value?.packageTitle).toBe('latest');
    expect(detail.detailLoading.value).toBe(false);
  });

  it('surfaces an initial detail failure instead of presenting an empty success state', async () => {
    mocks.getPackageDetail.mockRejectedValueOnce(new Error('detail unavailable'));
    scope = effectScope();
    const detail = scope.run(() =>
      usePackageDetail(
        () => undefined,
        () => 'pkg-1'
      )
    )!;

    await detail.loadPackageDetail('pkg-1');

    expect(detail.packageDetail.value).toBeNull();
    expect(detail.detailError.value).toBe('套餐详情加载失败，请稍后重试');
    expect(detail.detailLoading.value).toBe(false);
  });

  it('keeps the latest successful detail visible when a same-package refresh fails', async () => {
    mocks.getPackageDetail.mockResolvedValueOnce(detailFor('pkg-1', 'latest'));
    mocks.refreshPackageDetail.mockRejectedValueOnce(new Error('refresh unavailable'));
    scope = effectScope();
    const detail = scope.run(() =>
      usePackageDetail(
        () => undefined,
        () => 'pkg-1'
      )
    )!;

    await detail.loadPackageDetail('pkg-1');
    await detail.refreshDetail();

    expect(detail.packageDetail.value?.packageTitle).toBe('latest');
    expect(detail.detailError.value).toBe('套餐详情加载失败，请稍后重试');
    expect(detail.detailLoading.value).toBe(false);
    expect(mocks.error).toHaveBeenCalledWith('刷新套餐详情失败');
  });

  it('does not publish stale refresh feedback after a newer refresh wins', async () => {
    const first = createDeferred<PackageDetailResponse & { message: string }>();
    const second = createDeferred<PackageDetailResponse & { message: string }>();
    mocks.refreshPackageDetail
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const detail = scope.run(() =>
      usePackageDetail(
        () => undefined,
        () => 'pkg-1'
      )
    )!;

    const firstRefresh = detail.refreshDetail();
    const secondRefresh = detail.refreshDetail();
    second.resolve(refreshFor('pkg-1', 'latest'));
    await secondRefresh;
    first.resolve(refreshFor('pkg-1', 'stale'));
    await firstRefresh;

    expect(detail.packageDetail.value?.packageTitle).toBe('latest');
    expect(mocks.success).toHaveBeenCalledTimes(1);
    expect(mocks.success).toHaveBeenCalledWith('latest 已刷新');
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('cancels a late refresh after disposal without feedback or another POST', async () => {
    const pending = createDeferred<PackageDetailResponse & { message: string }>();
    mocks.refreshPackageDetail.mockReturnValue(pending.promise);
    scope = effectScope();
    const detail = scope.run(() =>
      usePackageDetail(
        () => undefined,
        () => 'pkg-1'
      )
    )!;

    const refresh = detail.refreshDetail();
    scope.stop();
    pending.resolve(refreshFor('pkg-1', 'late'));
    await refresh;
    await detail.refreshDetail();

    expect(mocks.refreshPackageDetail).toHaveBeenCalledTimes(1);
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });
});
