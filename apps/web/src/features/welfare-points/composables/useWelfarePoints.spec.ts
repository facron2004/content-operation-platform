import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';

const mocks = vi.hoisted(() => ({
  exportCsv: vi.fn(),
  getList: vi.fn(),
  getSummary: vi.fn(),
  refresh: vi.fn()
}));

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return { ...actual, onMounted: () => undefined };
});

vi.mock('../../../services/api/welfare-points.api', () => ({
  exportWelfarePointsCsv: mocks.exportCsv,
  getWelfarePointsList: mocks.getList,
  getWelfarePointsSummary: mocks.getSummary,
  refreshWelfarePoints: mocks.refresh
}));

vi.mock('../../../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

vi.mock('./welfare-points-chart', () => ({
  buildSourceBarOption: vi.fn(() => ({})),
  buildTopMembersOption: vi.fn(() => ({})),
  buildTrendOption: vi.fn(() => ({})),
  buildTypeDonutOption: vi.fn(() => ({}))
}));

import { useWelfarePoints } from './useWelfarePoints';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('welfare points manual sync', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    mocks.exportCsv.mockReset();
    mocks.getSummary.mockReset().mockResolvedValue({ cached: false });
    mocks.getList.mockReset().mockResolvedValue({ list: [], total: 0 });
    mocks.refresh.mockReset().mockResolvedValue({ total: 0 });
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('waits for upstream sync, then bypasses cache for summary and the selected list page', async () => {
    const sync = deferred();
    mocks.refresh.mockReturnValue(sync.promise);
    scope = effectScope();
    const page = scope.run(() => useWelfarePoints())!;
    page.page.value = 3;

    const reload = page.reload(true);
    await Promise.resolve();
    expect(mocks.getSummary).not.toHaveBeenCalled();
    expect(mocks.getList).not.toHaveBeenCalled();

    sync.resolve();
    await reload;

    expect(mocks.getSummary).toHaveBeenCalledWith(
      expect.objectContaining({ page: 3, pageSize: 20 }),
      true
    );
    expect(mocks.getList).toHaveBeenCalledWith(
      expect.objectContaining({ page: 3, pageSize: 20 }),
      true
    );
    expect(mocks.getSummary.mock.calls[0]?.[0]).not.toHaveProperty('reload');
  });
});
