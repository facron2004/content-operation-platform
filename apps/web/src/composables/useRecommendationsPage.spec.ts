import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRecommendations: vi.fn(),
  getCategories: vi.fn(),
  clearPackageCache: vi.fn(),
  routerPush: vi.fn(),
  dispose: undefined as (() => void) | undefined
}));

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return {
    ...actual,
    onMounted: (callback: () => void) => {
      void callback();
    },
    onScopeDispose: (callback: () => void) => {
      mocks.dispose = callback;
    }
  };
});

vi.mock('../services/api', () => ({
  api: mocks
}));
vi.mock('../services/cache.service', () => ({
  clearPackageCache: mocks.clearPackageCache
}));
vi.mock('../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));
vi.mock('../stores/role', () => ({
  useRoleStore: () => ({ currentRole: 'platform_operator' })
}));
vi.mock('vue-router', () => ({
  useRouter: () => ({
    currentRoute: { value: { query: {} } },
    push: mocks.routerPush
  })
}));

import { useRecommendationsPage } from './useRecommendationsPage';

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

function recommendationsFor(packageId: string) {
  return {
    packages: [{ packageId }],
    pagination: { total: 1 },
    truncated: false,
    limit: null,
    matchedCount: 1
  };
}

describe('useRecommendationsPage request lifecycle', () => {
  beforeEach(() => {
    mocks.getRecommendations.mockReset();
    mocks.getCategories.mockReset();
    mocks.clearPackageCache.mockReset();
    mocks.routerPush.mockReset();
    mocks.getCategories.mockResolvedValue({ categories: [] });
    mocks.dispose = undefined;
  });

  afterEach(() => {
    mocks.dispose?.();
  });

  it('ignores recommendation and category responses that finish after unmount', async () => {
    const recommendations = createDeferred<ReturnType<typeof recommendationsFor>>();
    const categories = createDeferred<{ categories: string[] }>();
    mocks.getRecommendations.mockReturnValueOnce(recommendations.promise);
    mocks.getCategories.mockReturnValueOnce(categories.promise);

    const page = useRecommendationsPage();
    mocks.dispose?.();
    recommendations.resolve(recommendationsFor('PKG-late'));
    categories.resolve({ categories: ['late-category'] });
    await Promise.resolve();
    await Promise.resolve();

    expect(page.items.value).toEqual([]);
    expect(page.categoryOptions.value).toEqual([]);
    expect(page.loading.value).toBe(false);
  });

  it('does not start another request after the page has unmounted', async () => {
    mocks.getRecommendations.mockResolvedValue(recommendationsFor('PKG-initial'));

    const page = useRecommendationsPage();
    await Promise.resolve();
    mocks.dispose?.();
    const callsBeforeReload = mocks.getRecommendations.mock.calls.length;

    await page.load(true);

    expect(mocks.getRecommendations).toHaveBeenCalledTimes(callsBeforeReload);
    expect(page.loading.value).toBe(false);
  });

  it('surfaces an initial recommendation failure instead of treating the table as empty success', async () => {
    mocks.getRecommendations.mockRejectedValue(new Error('推荐服务不可用'));

    const page = useRecommendationsPage();
    await vi.waitFor(() => expect(page.loadError.value).toBe('推荐套餐加载失败，请稍后重试'));

    expect(page.items.value).toEqual([]);
    expect(page.loading.value).toBe(false);
  });

  it('keeps the last successful recommendations visible when a refresh fails', async () => {
    mocks.getRecommendations
      .mockResolvedValueOnce(recommendationsFor('PKG-latest'))
      .mockRejectedValueOnce(new Error('推荐服务暂时不可用'));
    const page = useRecommendationsPage();
    await vi.waitFor(() => expect(page.items.value[0]?.packageId).toBe('PKG-latest'));

    await page.load(true);

    expect(page.items.value[0]?.packageId).toBe('PKG-latest');
    expect(page.loadError.value).toBe('推荐套餐加载失败，请稍后重试');
    expect(page.loading.value).toBe(false);
  });

  it('keeps successful list metadata and preserves page actions through the facade', async () => {
    mocks.getRecommendations.mockResolvedValueOnce({
      packages: [
        { packageId: 'PKG-1', areaId: 'A-1', areaName: 'Area 1' },
        { packageId: 'PKG-2', areaId: 'A-1', areaName: 'Area 1' },
        { packageId: 'PKG-3', areaId: 'A-2', areaName: 'Area 2' }
      ],
      pagination: { total: 3 },
      truncated: true,
      limit: 200,
      matchedCount: 3
    });
    mocks.getCategories.mockResolvedValueOnce({ categories: ['Category 1'] });

    const page = useRecommendationsPage();
    await vi.waitFor(() => expect(page.items.value).toHaveLength(3));

    expect(page.areaOptions.value).toEqual([
      { value: 'A-1', label: 'Area 1' },
      { value: 'A-2', label: 'Area 2' }
    ]);
    expect(page.categoryOptions.value).toEqual(['Category 1']);
    expect(page.listTruncated.value).toBe(true);
    expect(page.listLimit.value).toBe(200);
    expect(page.matchedCount.value).toBe(3);

    page.openAnalysis({ packageId: 'PKG-1' } as Parameters<typeof page.openAnalysis>[0]);
    page.goGenerate('PKG-1');
    expect(mocks.routerPush).toHaveBeenNthCalledWith(1, '/packages/PKG-1');
    expect(mocks.routerPush).toHaveBeenNthCalledWith(2, {
      path: '/generate',
      query: { packageId: 'PKG-1' }
    });
  });

  it('surfaces category option failure and clears it after a successful retry', async () => {
    mocks.getRecommendations.mockResolvedValue(recommendationsFor('PKG-1'));
    mocks.getCategories
      .mockRejectedValueOnce(new Error('category service unavailable'))
      .mockResolvedValueOnce({ categories: ['Category recovered'] });

    const page = useRecommendationsPage();
    await vi.waitFor(() => expect(page.categoryError.value).toBe('推荐分类加载失败，请稍后重试'));
    expect(page.categoryOptions.value).toEqual([]);

    await page.loadCategoryOptions();

    expect(page.categoryError.value).toBeNull();
    expect(page.categoryOptions.value).toEqual(['Category recovered']);
  });
});
