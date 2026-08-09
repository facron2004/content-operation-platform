import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPackageAnalysis: vi.fn(),
  dispose: undefined as (() => void) | undefined
}));

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return {
    ...actual,
    onMounted: (callback: () => void) => callback(),
    onScopeDispose: (callback: () => void) => {
      mocks.dispose = callback;
    }
  };
});

vi.mock('../services/api', () => ({ api: mocks }));
vi.mock('../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() })
}));

import { usePackageAnalysisPage } from './usePackageAnalysisPage';

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

function analysisFor(packageId: string) {
  return { package: { packageId } };
}

describe('usePackageAnalysisPage request lifecycle', () => {
  beforeEach(() => {
    mocks.getPackageAnalysis.mockReset();
    mocks.dispose = undefined;
  });

  afterEach(() => {
    mocks.dispose?.();
  });

  it('keeps the latest analysis when an earlier load resolves late', async () => {
    const first = createDeferred<ReturnType<typeof analysisFor>>();
    const second = createDeferred<ReturnType<typeof analysisFor>>();
    mocks.getPackageAnalysis
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    const page = usePackageAnalysisPage('PKG-1');
    const secondLoad = page.load();

    second.resolve(analysisFor('PKG-latest'));
    await secondLoad;
    expect(page.pkg.value?.packageId).toBe('PKG-latest');

    first.resolve(analysisFor('PKG-stale'));
    await Promise.resolve();

    expect(page.pkg.value?.packageId).toBe('PKG-latest');
    expect(page.loading.value).toBe(false);
  });

  it('ignores a response that finishes after unmount', async () => {
    const request = createDeferred<ReturnType<typeof analysisFor>>();
    mocks.getPackageAnalysis.mockImplementationOnce(() => request.promise);

    const page = usePackageAnalysisPage('PKG-1');
    mocks.dispose?.();
    request.resolve(analysisFor('PKG-late'));
    await Promise.resolve();

    expect(page.pkg.value).toBeUndefined();
    expect(page.loading.value).toBe(false);
  });

  it('blocks new loads after scope disposal', async () => {
    const request = createDeferred<ReturnType<typeof analysisFor>>();
    mocks.getPackageAnalysis.mockImplementationOnce(() => request.promise);

    const page = usePackageAnalysisPage('PKG-1');
    mocks.dispose?.();
    await page.load();

    expect(mocks.getPackageAnalysis).toHaveBeenCalledTimes(1);
    expect(page.loading.value).toBe(false);
  });

  it('surfaces initial API failures instead of presenting an empty analysis state', async () => {
    mocks.getPackageAnalysis.mockRejectedValueOnce(new Error('backend unavailable'));

    const page = usePackageAnalysisPage('PKG-1');
    await Promise.resolve();
    await Promise.resolve();

    expect(page.loading.value).toBe(false);
    expect(page.pkg.value).toBeUndefined();
    expect(page.loadError.value).toBe('套餐分析加载失败，请稍后重试');
  });

  it('keeps the latest successful analysis visible when a refresh fails', async () => {
    mocks.getPackageAnalysis.mockResolvedValueOnce(analysisFor('PKG-latest'));
    const page = usePackageAnalysisPage('PKG-1');
    await Promise.resolve();
    await Promise.resolve();

    mocks.getPackageAnalysis.mockRejectedValueOnce(new Error('refresh unavailable'));
    await page.load();

    expect(page.pkg.value?.packageId).toBe('PKG-latest');
    expect(page.loadError.value).toBe('套餐分析加载失败，请稍后重试');
    expect(page.loading.value).toBe(false);
  });
});
