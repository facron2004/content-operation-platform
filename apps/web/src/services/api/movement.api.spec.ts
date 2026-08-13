import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ clientGet: vi.fn() }));

vi.mock('../http-client', () => ({
  default: { get: mocks.clientGet }
}));

import { getMovementMoving, getMovementStagnant, getMovementToday } from './movement.api';

describe('movement API reload', () => {
  beforeEach(() => {
    mocks.clientGet.mockReset().mockResolvedValue({ data: { items: [] } });
  });

  it('uses ordinary URLs for mount, date, filter and pagination reads', async () => {
    await getMovementToday('2026-08-05');
    await getMovementStagnant({ bucket: 'stale_30d', page: 2, pageSize: 20 });
    await getMovementMoving({ days: 7, page: 3, pageSize: 20 });

    expect(mocks.clientGet).toHaveBeenNthCalledWith(1, '/movement/today', {
      params: { date: '2026-08-05' }
    });
    expect(mocks.clientGet).toHaveBeenNthCalledWith(2, '/movement/skus/stagnant', {
      params: { bucket: 'stale_30d', page: 2, pageSize: 20 }
    });
    expect(mocks.clientGet).toHaveBeenNthCalledWith(3, '/movement/skus/moving', {
      params: { days: 7, page: 3, pageSize: 20 }
    });
  });

  it('sends a declared force signal on both real GETs for a manual reload', async () => {
    await getMovementToday('2026-08-05', true);
    await getMovementStagnant({ bucket: 'stale_30d', page: 1, pageSize: 20 }, true);
    await getMovementMoving({ days: 7, page: 1, pageSize: 20 }, true);

    expect(mocks.clientGet).toHaveBeenNthCalledWith(1, '/movement/today?force=true', {
      params: { date: '2026-08-05' }
    });
    expect(mocks.clientGet).toHaveBeenNthCalledWith(2, '/movement/skus/stagnant?force=true', {
      params: { bucket: 'stale_30d', page: 1, pageSize: 20 }
    });
    expect(mocks.clientGet).toHaveBeenNthCalledWith(3, '/movement/skus/moving?force=true', {
      params: { days: 7, page: 1, pageSize: 20 }
    });
  });
});
