import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetPrefetchSetForTests,
  collectNavLeafPaths,
  prefetchNavPaths,
  prefetchRouteComponents,
  routeViewCacheKey
} from './route-view-cache';

describe('routeViewCacheKey', () => {
  it('uses route name for static pages', () => {
    expect(
      routeViewCacheKey({
        name: 'merchants',
        path: '/merchants',
        fullPath: '/merchants',
        matched: [{ path: 'merchants' }]
      } as never)
    ).toBe('merchants');
  });

  it('uses fullPath when any matched record is dynamic', () => {
    expect(
      routeViewCacheKey({
        name: 'task-detail',
        path: '/tasks/t1',
        fullPath: '/tasks/t1?x=1',
        matched: [{ path: 'tasks' }, { path: 'tasks/:taskId' }]
      } as never)
    ).toBe('/tasks/t1?x=1');
  });
});

describe('collectNavLeafPaths', () => {
  it('flattens items and group children, skips disabled', () => {
    expect(
      collectNavLeafPaths([
        { kind: 'item', path: '/dashboard' },
        { kind: 'item', path: '/settlement', disabled: true },
        {
          kind: 'group',
          children: [{ path: '/merchants' }, { path: '/merchant-heatmap' }]
        }
      ])
    ).toEqual(['/dashboard', '/merchants', '/merchant-heatmap']);
  });
});

describe('prefetchRouteComponents', () => {
  beforeEach(() => {
    _resetPrefetchSetForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('invokes lazy component loaders once per path', async () => {
    const loader = vi.fn().mockResolvedValue({ default: {} });
    const router = {
      resolve: () => ({
        matched: [{ components: { default: loader } }]
      })
    };
    prefetchRouteComponents(router as never, '/merchant-heatmap');
    prefetchRouteComponents(router as never, '/merchant-heatmap');
    await Promise.resolve();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('allows retry after a failed prefetch', async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error('chunk'))
      .mockResolvedValueOnce({ default: {} });
    const router = {
      resolve: () => ({
        matched: [{ components: { default: loader } }]
      })
    };
    prefetchRouteComponents(router as never, '/gmv-cockpit');
    await new Promise((r) => setTimeout(r, 0));
    prefetchRouteComponents(router as never, '/gmv-cockpit');
    await new Promise((r) => setTimeout(r, 0));
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('cancels delayed navigation prefetch when its owner is disposed', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestIdleCallback', undefined);
    vi.stubGlobal('cancelIdleCallback', undefined);
    const loader = vi.fn().mockResolvedValue({ default: {} });
    const router = {
      resolve: () => ({
        matched: [{ components: { default: loader } }]
      })
    };

    const cancel = prefetchNavPaths(router as never, ['/merchant-heatmap']);
    cancel();
    await vi.advanceTimersByTimeAsync(800);

    expect(loader).not.toHaveBeenCalled();
  });
});
