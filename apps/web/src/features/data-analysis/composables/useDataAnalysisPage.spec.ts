import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';
import type { DataAnalysisSummary } from '../../../services/api/data-analysis.api';

const mocks = vi.hoisted(() => ({
  getDataAnalysisSummary: vi.fn(),
  getDataAnalysisExportUrl: vi.fn(() => '/data-analysis/export'),
  downloadBlob: vi.fn(),
  success: vi.fn(),
  mountedCallbacks: [] as Array<() => void>
}));

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return {
    ...actual,
    onMounted: (callback: () => void) => mocks.mountedCallbacks.push(callback)
  };
});

vi.mock('element-plus', () => ({
  ElMessage: { success: mocks.success }
}));

vi.mock('../../../services/api/data-analysis.api', () => ({
  getDataAnalysisSummary: mocks.getDataAnalysisSummary,
  getDataAnalysisExportUrl: mocks.getDataAnalysisExportUrl
}));

vi.mock('../../../services/http-client', () => ({
  downloadBlob: mocks.downloadBlob,
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

import { useDataAnalysisPage } from './useDataAnalysisPage';

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

function summaryFor(date: string) {
  return { date, endDate: date } as unknown as DataAnalysisSummary;
}

describe('data analysis page request lifecycle', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    mocks.getDataAnalysisSummary.mockReset().mockResolvedValue(summaryFor('default'));
    mocks.downloadBlob.mockReset().mockResolvedValue(undefined);
    mocks.getDataAnalysisExportUrl.mockClear();
    mocks.success.mockReset();
    mocks.mountedCallbacks.length = 0;
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('keeps the latest summary when an earlier range response resolves late', async () => {
    const first = createDeferred<DataAnalysisSummary>();
    const second = createDeferred<DataAnalysisSummary>();
    mocks.getDataAnalysisSummary
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const page = scope.run(() => useDataAnalysisPage())!;

    const firstReload = page.reload();
    const secondReload = page.reload();
    second.resolve(summaryFor('latest'));
    await secondReload;
    first.reject(new Error('stale summary failure'));
    await firstReload;

    expect(page.summary?.date).toBe('latest');
    expect(page.loadError).toBeNull();
    expect(page.loading).toBe(false);
  });

  it('uses force only for an explicit manual reload', async () => {
    scope = effectScope();
    const page = scope.run(() => useDataAnalysisPage())!;

    await page.reload(true);

    expect(mocks.getDataAnalysisSummary).toHaveBeenCalledWith(
      expect.objectContaining({ force: true })
    );
  });

  it('keeps mount, preset, and custom-range loads on the ordinary path', async () => {
    scope = effectScope();
    const page = scope.run(() => useDataAnalysisPage())!;

    mocks.mountedCallbacks[0]?.();
    await vi.waitFor(() => expect(mocks.getDataAnalysisSummary).toHaveBeenCalledTimes(1));
    page.onPresetChange('last7');
    await vi.waitFor(() => expect(mocks.getDataAnalysisSummary).toHaveBeenCalledTimes(2));
    page.onCustomRangeChange(['2026-08-01', '2026-08-05']);
    await vi.waitFor(() => expect(mocks.getDataAnalysisSummary).toHaveBeenCalledTimes(3));

    expect(mocks.getDataAnalysisSummary.mock.calls.map(([params]) => params.force)).toEqual([
      false,
      false,
      false
    ]);
  });

  it('ignores late summary data and blocks reload/preset requests after disposal', async () => {
    const pending = createDeferred<DataAnalysisSummary>();
    mocks.getDataAnalysisSummary.mockReset().mockReturnValue(pending.promise);
    scope = effectScope();
    const page = scope.run(() => useDataAnalysisPage())!;
    const reload = page.reload();

    scope.stop();
    pending.resolve(summaryFor('late'));
    await reload;
    await page.reload();
    page.onPresetChange('today');

    expect(page.summary).toBeNull();
    expect(page.preset).toBe('last30');
    expect(page.loading).toBe(false);
    expect(mocks.getDataAnalysisSummary).toHaveBeenCalledTimes(1);
  });

  it('does not publish export feedback or start another export after disposal', async () => {
    const pending = createDeferred<void>();
    mocks.downloadBlob.mockReset().mockReturnValue(pending.promise);
    scope = effectScope();
    const page = scope.run(() => useDataAnalysisPage())!;
    const exportRun = page.onExport();

    scope.stop();
    pending.resolve();
    await exportRun;
    await page.onExport();

    expect(page.exporting).toBe(false);
    expect(page.exportError).toBeNull();
    expect(mocks.downloadBlob).toHaveBeenCalledTimes(1);
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it('keeps export failures visible until a retry succeeds', async () => {
    mocks.downloadBlob
      .mockRejectedValueOnce(new Error('export unavailable'))
      .mockResolvedValueOnce(undefined);
    scope = effectScope();
    const page = scope.run(() => useDataAnalysisPage())!;

    await page.onExport();

    expect(page.exportError).toBe('导出 Excel 失败');
    expect(page.exporting).toBe(false);

    await page.onExport();

    expect(page.exportError).toBeNull();
    expect(mocks.success).toHaveBeenCalledWith('Excel 已开始下载');
  });
});
