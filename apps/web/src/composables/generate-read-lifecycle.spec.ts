import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import type { RecommendPackageItem, RecommendResponse } from '@content/shared';

const mocks = vi.hoisted(() => ({
  getRecommendations: vi.fn(),
  getPackageAnalysis: vi.fn()
}));

vi.mock('../services/api', () => ({
  api: {
    getRecommendations: mocks.getRecommendations,
    getPackageAnalysis: mocks.getPackageAnalysis
  }
}));

vi.mock('../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} })
}));

import { loadGeneratePackages } from './generate-core';
import { useGenerate } from './useGenerate';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function packageFor(packageId: string): RecommendPackageItem {
  return { packageId } as RecommendPackageItem;
}

function pageFor(packageId: string, totalPages = 1, page = 1): RecommendResponse {
  return {
    date: '2026-08-05',
    areaId: 'all',
    packages: [packageFor(packageId)],
    pagination: {
      page,
      pageSize: 200,
      total: totalPages * 200,
      totalPages
    },
    matchedCount: totalPages * 200,
    limit: 200,
    truncated: false
  };
}

describe('Generate package read lifecycle', () => {
  beforeEach(() => {
    mocks.getRecommendations.mockReset();
    mocks.getPackageAnalysis.mockReset();
  });

  it('drops a stale package response when a newer load has started', async () => {
    const first = createDeferred<RecommendResponse>();
    const second = createDeferred<RecommendResponse>();
    mocks.getRecommendations
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const packages = ref<RecommendPackageItem[]>([]);
    const form = { packageId: '' };
    let currentRequest = 0;
    const firstRequest = ++currentRequest;
    const firstLoad = loadGeneratePackages(
      packages,
      form,
      undefined,
      () => firstRequest === currentRequest
    );
    const secondRequest = ++currentRequest;
    const secondLoad = loadGeneratePackages(
      packages,
      form,
      undefined,
      () => secondRequest === currentRequest
    );

    second.resolve(pageFor('latest'));
    await secondLoad;
    first.resolve(pageFor('stale'));
    await firstLoad;

    expect(packages.value.map((item) => item.packageId)).toEqual(['latest']);
    expect(form.packageId).toBe('latest');
  });

  it('does not publish a partial multi-page result after the request becomes inactive', async () => {
    const firstPage = createDeferred<RecommendResponse>();
    const secondPage = createDeferred<RecommendResponse>();
    mocks.getRecommendations
      .mockImplementationOnce(() => firstPage.promise)
      .mockImplementationOnce(() => secondPage.promise);
    const packages = ref<RecommendPackageItem[]>([]);
    const form = { packageId: '' };
    let active = true;
    const load = loadGeneratePackages(packages, form, undefined, () => active);

    firstPage.resolve(pageFor('first-page', 2, 1));
    await Promise.resolve();
    expect(mocks.getRecommendations).toHaveBeenCalledTimes(2);

    active = false;
    secondPage.resolve(pageFor('second-page', 2, 2));
    await load;

    expect(packages.value).toEqual([]);
    expect(form.packageId).toBe('');
  });

  it('surfaces a later page failure while keeping successful package pages', async () => {
    const pageError = new Error('second page unavailable');
    mocks.getRecommendations
      .mockResolvedValueOnce(pageFor('first-page', 2, 1))
      .mockRejectedValueOnce(pageError);
    const packages = ref<RecommendPackageItem[]>([]);
    const form = { packageId: '' };
    const honesty = { listTruncated: ref(false) };
    const onPartialPageError = vi.fn();

    await loadGeneratePackages(packages, form, honesty, () => true, onPartialPageError);

    expect(packages.value.map((item) => item.packageId)).toEqual(['first-page']);
    expect(honesty.listTruncated.value).toBe(true);
    expect(onPartialPageError).toHaveBeenCalledWith(pageError);
  });

  it('does not start another package load while the active composable load is pending', async () => {
    const pending = createDeferred<RecommendResponse>();
    mocks.getRecommendations.mockReturnValue(pending.promise);
    const scope = effectScope();
    const state = scope.run(() => useGenerate())!;
    const firstLoad = state.loadPackages();
    await state.loadPackages();
    expect(mocks.getRecommendations).toHaveBeenCalledTimes(1);
    pending.resolve(pageFor('loaded'));
    await firstLoad;
    expect(state.packages.value[0]?.packageId).toBe('loaded');
    scope.stop();
  });

  it('exposes the package list failure and clears it after a successful retry', async () => {
    mocks.getRecommendations.mockRejectedValueOnce(new Error('backend unavailable'));
    const scope = effectScope();
    const state = scope.run(() => useGenerate())!;

    await expect(state.loadPackages()).rejects.toThrow('backend unavailable');
    expect(state.packageLoadError.value).toBe('套餐列表加载失败，请稍后重试');

    mocks.getRecommendations.mockResolvedValueOnce(pageFor('recovered'));
    await state.loadPackages();

    expect(state.packageLoadError.value).toBeNull();
    expect(state.packages.value[0]?.packageId).toBe('recovered');
    scope.stop();
  });

  it('exposes a later page failure while keeping the available package result', async () => {
    mocks.getRecommendations
      .mockResolvedValueOnce(pageFor('first-page', 2, 1))
      .mockRejectedValueOnce(new Error('second page unavailable'));
    const scope = effectScope();
    const state = scope.run(() => useGenerate())!;

    await state.loadPackages();

    expect(state.packageLoadError.value).toBe('部分套餐列表加载失败，已显示可用结果：请稍后重试');
    expect(state.packages.value.map((item) => item.packageId)).toEqual(['first-page']);
    scope.stop();
  });

  it('surfaces a deep-link package context failure while preserving the requested id', async () => {
    mocks.getRecommendations.mockResolvedValueOnce(pageFor('other-package'));
    mocks.getPackageAnalysis.mockRejectedValueOnce(new Error('analysis unavailable'));
    const scope = effectScope();
    const state = scope.run(() => useGenerate())!;
    state.form.packageId = 'deep-link-package';

    await state.loadPackages();

    expect(state.form.packageId).toBe('deep-link-package');
    expect(state.packageLoadError.value).toBe('深链套餐上下文加载失败，已保留套餐 ID：请稍后重试');
    scope.stop();
  });
});
