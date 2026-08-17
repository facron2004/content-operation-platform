import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';

const mocks = vi.hoisted(() => ({
  getList: vi.fn()
}));

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return { ...actual, onMounted: () => undefined };
});

vi.mock('../../../services/api/welfare-points.api', () => ({
  getWelfarePointsList: mocks.getList
}));

vi.mock('../../../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

import { useWelfarePoints } from './useWelfarePoints';

describe('welfare points current-page refresh', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    mocks.getList.mockReset().mockResolvedValue({
      list: [],
      total: 163780,
      page: 3,
      pageSize: 20,
      dataSource: 'JeeSite'
    });
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('reads only the selected upstream page and bypasses the browser cache', async () => {
    scope = effectScope();
    const page = scope.run(() => useWelfarePoints())!;
    page.page.value = 3;

    await page.reload();

    expect(mocks.getList).toHaveBeenCalledWith({ page: 3, pageSize: 20 }, true);
    expect(page.total.value).toBe(163780);
    expect(page.dataSource.value).toBe('JeeSite');
  });
});
