import { effectScope, nextTick, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { bindAlertWatchers, createAlertLoader, createAlertState } from './alert-core';

const mocks = vi.hoisted(() => ({ getAlerts: vi.fn() }));
vi.mock('../../../services/api', () => ({ api: mocks }));
vi.mock('../../../services/http-client', () => ({
  extractErrorMessage: (error: unknown) => (error instanceof Error ? error.message : 'error')
}));

describe('alert list request stability', () => {
  it('cancels a pending filter debounce before an explicit load', async () => {
    vi.useFakeTimers();
    mocks.getAlerts.mockResolvedValue({
      items: [],
      summary: {
        totalCount: 0,
        activeCount: 0,
        resolvedCount: 0,
        dangerCount: 0,
        warningCount: 0,
        infoCount: 0,
        packageCount: 0,
        typeDistribution: {}
      },
      topPackages: [],
      pagination: { page: 1, pageSize: 80, total: 0, totalPages: 0 }
    });
    const scope = effectScope();
    const state = createAlertState();
    const role = ref<string | undefined>('admin');
    const load = createAlertLoader(state, role);

    try {
      scope.run(() => {
        bindAlertWatchers({
          filters: state.filters,
          pagination: state.pagination,
          role,
          load,
          setFilterTimer: (timer) => {
            state.filterTimer.value = timer;
          },
          getFilterTimer: () => state.filterTimer.value
        });
      });

      state.filters.keyword = 'alice';
      await nextTick();
      await load();
      await vi.advanceTimersByTimeAsync(500);

      expect(mocks.getAlerts).toHaveBeenCalledTimes(1);
    } finally {
      scope.stop();
      mocks.getAlerts.mockReset();
      vi.useRealTimers();
    }
  });
});
