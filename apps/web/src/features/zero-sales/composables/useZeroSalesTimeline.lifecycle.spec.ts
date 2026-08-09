import { effectScope } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getZeroSalesTimeline: vi.fn()
}));

vi.mock('../../../services/api/zero-sales.api', () => ({
  getZeroSalesTimeline: mocks.getZeroSalesTimeline
}));
vi.mock('../../../services/http-client', () => ({
  extractErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback
}));
vi.mock('../../../services/http-client-utils', () => ({
  isRequestCanceled: () => false
}));

import { useZeroSalesTimeline } from './useZeroSalesTimeline';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function row() {
  return { packageId: 'pkg-1', packageName: '套餐一', merchantName: '商家一' };
}

function response() {
  return {
    days: 30,
    timeline: [{ date: '2026-08-08', stockLeft: 3, salesQty: 2, deltaSource: 'order_header' }]
  };
}

describe('useZeroSalesTimeline lifecycle', () => {
  beforeEach(() => {
    mocks.getZeroSalesTimeline.mockReset();
  });

  it('keeps timeline failures visible until a retry succeeds', async () => {
    mocks.getZeroSalesTimeline
      .mockRejectedValueOnce(new Error('timeline unavailable'))
      .mockResolvedValueOnce(response());
    const scope = effectScope();
    let timeline!: ReturnType<typeof useZeroSalesTimeline>;
    scope.run(() => {
      timeline = useZeroSalesTimeline();
    });

    await timeline.open(row());
    expect(timeline.error.value).toBe('timeline unavailable');
    expect(timeline.timeline.value).toEqual([]);

    await timeline.setDays(14);
    expect(timeline.error.value).toBeNull();
    expect(timeline.timeline.value).toEqual(response().timeline);
    expect(mocks.getZeroSalesTimeline).toHaveBeenLastCalledWith('pkg-1', 14);

    scope.stop();
  });

  it('drops late data after the drawer closes', async () => {
    const pending = createDeferred<ReturnType<typeof response>>();
    mocks.getZeroSalesTimeline.mockReturnValue(pending.promise);
    const scope = effectScope();
    let timeline!: ReturnType<typeof useZeroSalesTimeline>;
    scope.run(() => {
      timeline = useZeroSalesTimeline();
    });

    const opening = timeline.open(row());
    timeline.close();
    pending.resolve(response());
    await opening;

    expect(timeline.drawerVisible.value).toBe(false);
    expect(timeline.timeline.value).toEqual([]);
    expect(timeline.error.value).toBeNull();
    expect(timeline.loading.value).toBe(false);

    scope.stop();
  });

  it('blocks new reads after scope disposal', async () => {
    const pending = createDeferred<ReturnType<typeof response>>();
    mocks.getZeroSalesTimeline.mockReturnValue(pending.promise);
    const scope = effectScope();
    let timeline!: ReturnType<typeof useZeroSalesTimeline>;
    scope.run(() => {
      timeline = useZeroSalesTimeline();
    });

    const opening = timeline.open(row());
    scope.stop();
    pending.resolve(response());
    await opening;
    await timeline.open(row());

    expect(mocks.getZeroSalesTimeline).toHaveBeenCalledTimes(1);
    expect(timeline.timeline.value).toEqual([]);
    expect(timeline.loading.value).toBe(false);
  });
});
