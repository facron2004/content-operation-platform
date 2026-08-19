import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserCenterService } from '../src/user-center/user-center.service';
import { UserCenterRefreshStartup } from '../src/user-center/user-center-refresh-startup';

const previous = {
  externalBaseUrl: process.env.EXTERNAL_API_BASE_URL,
  nodeEnv: process.env.NODE_ENV,
  vitest: process.env.VITEST,
  startupEnabled: process.env.USER_CENTER_REFRESH_ON_STARTUP
};

afterEach(() => {
  vi.restoreAllMocks();
  if (previous.externalBaseUrl === undefined) delete process.env.EXTERNAL_API_BASE_URL;
  else process.env.EXTERNAL_API_BASE_URL = previous.externalBaseUrl;
  if (previous.nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previous.nodeEnv;
  if (previous.vitest === undefined) delete process.env.VITEST;
  else process.env.VITEST = previous.vitest;
  if (previous.startupEnabled === undefined) delete process.env.USER_CENTER_REFRESH_ON_STARTUP;
  else process.env.USER_CENTER_REFRESH_ON_STARTUP = previous.startupEnabled;
});

function createStartup(startIncrementalRefreshJob: () => Promise<unknown> | unknown) {
  const userCenter = { startIncrementalRefreshJob } as unknown as UserCenterService;
  return new UserCenterRefreshStartup(userCenter);
}

describe('user center refresh startup', () => {
  it('starts a controlled refresh when the API has an external source', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.VITEST;
    process.env.EXTERNAL_API_BASE_URL = 'https://example.test/a';
    process.env.USER_CENTER_REFRESH_ON_STARTUP = 'true';
    const startIncrementalRefreshJob = vi
      .fn()
      .mockResolvedValue({ jobId: 'job-1', kind: 'incremental' });

    createStartup(startIncrementalRefreshJob).onApplicationBootstrap();

    expect(startIncrementalRefreshJob).toHaveBeenCalledTimes(1);
  });

  it('does not start a refresh when the startup switch is disabled', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.VITEST;
    process.env.EXTERNAL_API_BASE_URL = 'https://example.test/a';
    process.env.USER_CENTER_REFRESH_ON_STARTUP = 'false';
    const startIncrementalRefreshJob = vi.fn();

    createStartup(startIncrementalRefreshJob).onApplicationBootstrap();

    expect(startIncrementalRefreshJob).not.toHaveBeenCalled();
  });

  it('does not start a refresh without an external source', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.VITEST;
    delete process.env.EXTERNAL_API_BASE_URL;
    process.env.USER_CENTER_REFRESH_ON_STARTUP = 'true';
    const startIncrementalRefreshJob = vi.fn();

    createStartup(startIncrementalRefreshJob).onApplicationBootstrap();

    expect(startIncrementalRefreshJob).not.toHaveBeenCalled();
  });
});
