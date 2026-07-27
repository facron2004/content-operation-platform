import { describe, expect, it, vi } from 'vitest';
import { usePagedList } from './usePagedList';

describe('usePagedList', () => {
  it('loads initial data via fetcher', async () => {
    const fetcher = vi.fn().mockResolvedValue({ items: [1, 2], total: 2 });
    const list = usePagedList<number, { keyword: string }>(
      fetcher,
      { keyword: '' },
      { filterDebounceMs: 0 }
    );
    await list.load();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(list.items.value).toEqual([1, 2]);
  });

  it('handles stale responses via requestId', async () => {
    const fetcher = vi.fn();
    fetcher
      .mockResolvedValueOnce(
        new Promise((resolve) => setTimeout(() => resolve({ items: [1, 2], total: 2 }), 100))
      )
      .mockResolvedValueOnce(Promise.resolve({ items: [3], total: 1 }));
    const list = usePagedList<number, { keyword: string }>(
      fetcher,
      { keyword: '' },
      { filterDebounceMs: 0 }
    );
    // Start first slow load
    list.load();
    // Second fast load completes first, incrementing requestId
    await list.load();
    // Wait for slow promise to resolve (its result will be stale)
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(list.items.value).toEqual([3]);
  });

  it('supports pagination methods', () => {
    const list = usePagedList<number, { keyword: string }>(
      vi.fn().mockResolvedValue({ items: [], total: 0 }),
      { keyword: '' },
      { filterDebounceMs: 0 }
    );
    expect(list.pagination.value.current).toBe(1);
    expect(list.pagination.value.pageSize).toBe(20);
  });

  it('clamps page and pageSize to server-side ceilings', () => {
    const list = usePagedList<number, { keyword: string }>(
      vi.fn().mockResolvedValue({ items: [], total: 0 }),
      { keyword: '' },
      { filterDebounceMs: 0, defaultPageSize: 9999 }
    );
    // defaultPageSize over Max is clamped on init
    expect(list.pagination.value.pageSize).toBe(200);
    list.setPageSize(5000);
    expect(list.pagination.value.pageSize).toBe(200);
    list.setPage(99999);
    expect(list.pagination.value.current).toBe(500);
    list.setPage(0);
    expect(list.pagination.value.current).toBe(1);
    list.setPageSize(-3);
    expect(list.pagination.value.pageSize).toBe(20);
  });

  it('debounces filter changes', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue({ items: [], total: 0 });
    const list = usePagedList<number, { keyword: string }>(fetcher, { keyword: '' });
    list.updateFilter({ keyword: 'a' });
    list.updateFilter({ keyword: 'ab' });
    list.updateFilter({ keyword: 'abc' });
    expect(fetcher).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(600);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0].filters.keyword).toBe('abc');
    vi.useRealTimers();
  });

  it('soft-caches visited pages so flipping back is instant', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ items: [1], total: 40 })
      .mockResolvedValueOnce({ items: [2], total: 40 })
      .mockResolvedValue({ items: [99], total: 40 });
    const list = usePagedList<number, { keyword: string }>(
      fetcher,
      { keyword: '' },
      { filterDebounceMs: 0, pageCacheSize: 4 }
    );
    await list.load();
    expect(list.items.value).toEqual([1]);
    list.setPage(2);
    await Promise.resolve();
    await Promise.resolve();
    expect(list.items.value).toEqual([2]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    list.setPage(1);
    await Promise.resolve();
    expect(list.items.value).toEqual([1]);
    // Cache hit — no third network call
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps previous items visible while loading a new page', async () => {
    let resolveSecond!: (v: { items: number[]; total: number }) => void;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ items: [1, 2], total: 4 })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          })
      );
    const list = usePagedList<number, { keyword: string }>(
      fetcher,
      { keyword: '' },
      { filterDebounceMs: 0, pageCacheSize: 0 }
    );
    await list.load();
    expect(list.items.value).toEqual([1, 2]);
    list.setPage(2);
    await Promise.resolve();
    expect(list.loading.value).toBe(true);
    // Previous page still rendered while waiting
    expect(list.items.value).toEqual([1, 2]);
    resolveSecond({ items: [3, 4], total: 4 });
    await Promise.resolve();
    await Promise.resolve();
    expect(list.items.value).toEqual([3, 4]);
    expect(list.loading.value).toBe(false);
  });
});
