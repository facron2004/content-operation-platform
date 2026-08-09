import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  clearCache: vi.fn()
}));

vi.mock('../http-client', () => ({
  default: { post: mocks.post }
}));

vi.mock('../cache.service', () => ({
  cachedGet: vi.fn(),
  clearCache: mocks.clearCache
}));

import { startCampaign } from './campaign.api';
import { startGmvRefresh } from './gmv.api';
import { createTask, publishTask } from './task.api';

describe('critical write API idempotency headers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.post.mockResolvedValue({ data: {} });
  });

  it('sends the supplied submission intent for task creation', async () => {
    const payload = {
      packageId: 'package-1',
      channel: 'wechat_group',
      priority: 'normal'
    };

    await createTask(payload, 'create-task:intent-1');

    expect(mocks.post).toHaveBeenCalledWith('/tasks', payload, {
      headers: { 'Idempotency-Key': 'create-task:intent-1' }
    });
  });

  it('uses task and campaign versions as business intent keys', async () => {
    await publishTask('task-1', { note: 'publish' }, 'v7');
    await startCampaign('campaign-1', 'v3');

    expect(mocks.post).toHaveBeenNthCalledWith(
      1,
      '/tasks/task-1/publish',
      { note: 'publish' },
      { headers: { 'Idempotency-Key': 'publish-task:task-1:v7' } }
    );
    expect(mocks.post).toHaveBeenNthCalledWith(2, '/campaigns/campaign-1/start', undefined, {
      headers: { 'Idempotency-Key': 'campaign-start:campaign-1:v3' }
    });
  });

  it('includes the date range and source version in a GMV backfill intent', async () => {
    await startGmvRefresh('2026-08-01', '2026-08-09', 'source-v2');

    expect(mocks.post).toHaveBeenCalledWith(
      expect.stringMatching(/^\/gmv\/refresh\?_=/),
      { startDate: '2026-08-01', endDate: '2026-08-09' },
      expect.objectContaining({
        headers: {
          'Idempotency-Key': 'data-backfill:2026-08-01:2026-08-09:source-v2'
        }
      })
    );
  });
});
