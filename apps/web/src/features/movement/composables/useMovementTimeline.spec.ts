import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';
import type { MovementTimelineResponse } from '../../../services/api/movement.api';

const mocks = vi.hoisted(() => ({
  getMovementTimeline: vi.fn()
}));

vi.mock('../../../services/api/movement.api', () => ({
  getMovementTimeline: mocks.getMovementTimeline
}));

vi.mock('../../../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

import { useMovementTimeline } from './useMovementTimeline';

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

function timelineFor(packageId: string, days = 30): MovementTimelineResponse {
  return {
    packageId,
    days,
    timeline: [{ date: '2026-08-05', stockLeft: 4, salesQty: 2, deltaSource: 'order' }]
  };
}

function row(packageId: string) {
  return { packageId, packageName: packageId, merchantName: `${packageId}-merchant` };
}

describe('useMovementTimeline request lifecycle', () => {
  let scope: EffectScope | undefined;

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('keeps the latest SKU timeline when an earlier open resolves late', async () => {
    const first = createDeferred<MovementTimelineResponse>();
    const second = createDeferred<MovementTimelineResponse>();
    mocks.getMovementTimeline
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const timeline = scope.run(() => useMovementTimeline())!;

    const firstOpen = timeline.open(row('package-a'));
    const secondOpen = timeline.open(row('package-b'));
    second.resolve(timelineFor('package-b', 14));
    await secondOpen;
    first.resolve(timelineFor('package-a'));
    await firstOpen;

    expect(timeline.packageId.value).toBe('package-b');
    expect(timeline.days.value).toBe(14);
    expect(timeline.timeline.value[0]?.stockLeft).toBe(4);
    expect(timeline.loading.value).toBe(false);
  });

  it('does not let a stale error clear the latest successful timeline', async () => {
    const first = createDeferred<MovementTimelineResponse>();
    const second = createDeferred<MovementTimelineResponse>();
    mocks.getMovementTimeline
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const timeline = scope.run(() => useMovementTimeline())!;

    const firstOpen = timeline.open(row('package-a'));
    const secondOpen = timeline.open(row('package-b'));
    second.resolve(timelineFor('package-b'));
    await secondOpen;
    first.reject(new Error('stale failure'));
    await firstOpen;

    expect(timeline.timeline.value).toHaveLength(1);
    expect(timeline.loading.value).toBe(false);
  });

  it('keeps the current request failure visible until a retry succeeds', async () => {
    mocks.getMovementTimeline
      .mockReset()
      .mockRejectedValueOnce(new Error('timeline unavailable'))
      .mockResolvedValueOnce(timelineFor('package-a', 14));
    scope = effectScope();
    const timeline = scope.run(() => useMovementTimeline())!;

    await timeline.open(row('package-a'));

    expect(timeline.error.value).toBe('加载动销时间线失败');

    await timeline.setDays(14);

    expect(timeline.error.value).toBeNull();
    expect(timeline.timeline.value).toHaveLength(1);
    expect(timeline.loading.value).toBe(false);
  });

  it('ignores late data and blocks new requests after scope disposal', async () => {
    const pending = createDeferred<MovementTimelineResponse>();
    mocks.getMovementTimeline.mockReset().mockReturnValue(pending.promise);
    scope = effectScope();
    const timeline = scope.run(() => useMovementTimeline())!;
    const open = timeline.open(row('package-a'));

    scope.stop();
    pending.resolve(timelineFor('package-a'));
    await open;
    await timeline.open(row('package-b'));

    expect(timeline.timeline.value).toEqual([]);
    expect(timeline.loading.value).toBe(false);
    expect(mocks.getMovementTimeline).toHaveBeenCalledTimes(1);
  });
});
