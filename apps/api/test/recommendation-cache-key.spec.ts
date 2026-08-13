import { describe, expect, it, vi } from 'vitest';
import {
  createRecommendationRuntime,
  recommendationCacheKey,
  type RecommendationPayload
} from '../src/content/content-recommendation-runtime';

const payload = (areaId: string): RecommendationPayload => ({
  date: '2026-08-08',
  areaId,
  packages: [],
  matchedCount: 0
});

describe('recommendationCacheKey', () => {
  it('separates multi-scope areaIds so operators do not share cache', () => {
    const a = recommendationCacheKey({ areaIds: ['A2', 'A1'], status: 'selling' });
    const b = recommendationCacheKey({ areaIds: ['A3', 'A4'], status: 'selling' });
    const c = recommendationCacheKey({ status: 'selling' });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(b).not.toBe(c);
  });

  it('is stable under areaIds order and duplicates', () => {
    const a = recommendationCacheKey({ areaIds: ['A2', 'A1', 'A1'], merchantIds: ['M1'] });
    const b = recommendationCacheKey({ areaIds: ['A1', 'A2'], merchantIds: ['M1'] });
    expect(a).toBe(b);
    expect(a).toContain('A1,A2');
  });

  it('detaches invalidated in-flight results from the recommendation cache', async () => {
    const stalePayload = payload('stale');
    const freshPayload = payload('fresh');
    let resolveStale!: (result: RecommendationPayload) => void;
    const staleLoad = new Promise<RecommendationPayload>((resolve) => {
      resolveStale = resolve;
    });
    const compute = vi.fn().mockReturnValueOnce(staleLoad).mockResolvedValueOnce(freshPayload);
    const runtime = createRecommendationRuntime(compute);
    const query = { status: 'selling' as const };

    const staleFlight = runtime.getRecommendations(query);
    runtime.invalidate();
    await expect(runtime.getRecommendations(query)).resolves.toBe(freshPayload);

    resolveStale(stalePayload);
    await expect(staleFlight).resolves.toBe(stalePayload);
    await expect(runtime.getRecommendations(query)).resolves.toBe(freshPayload);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('force-refreshes only the requested recommendation key', async () => {
    const compute = vi.fn(async (query: { category?: string }) =>
      payload(`${query.category ?? 'all'}-${compute.mock.calls.length}`)
    );
    const runtime = createRecommendationRuntime(compute);
    const food = { status: 'selling' as const, category: 'food' };
    const hotel = { status: 'selling' as const, category: 'hotel' };

    const firstFood = await runtime.getRecommendations(food);
    const firstHotel = await runtime.getRecommendations(hotel);
    await expect(runtime.getRecommendations(food)).resolves.toBe(firstFood);
    await expect(runtime.getRecommendations(food, true)).resolves.not.toBe(firstFood);
    await expect(runtime.getRecommendations(hotel)).resolves.toBe(firstHotel);

    expect(compute).toHaveBeenCalledTimes(3);
  });
});
