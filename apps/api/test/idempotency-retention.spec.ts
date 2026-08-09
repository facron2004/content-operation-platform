import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IdempotencyRetentionJob } from '../src/jobs/idempotency-retention.job';
import { createJobRunnerMock } from './helpers/job-runner';

describe('IdempotencyRetentionJob', () => {
  const service = {
    purgeExpired: vi.fn()
  };
  let runner: ReturnType<typeof createJobRunnerMock>;
  let job: IdempotencyRetentionJob;

  beforeEach(() => {
    vi.clearAllMocks();
    runner = createJobRunnerMock();
    job = new IdempotencyRetentionJob(service as never, runner as never);
  });

  it('records a daily cleanup run and removes expired records', async () => {
    service.purgeExpired.mockResolvedValue(7);

    await job.purgeExpiredRecords();

    expect(runner.runJob).toHaveBeenCalledWith('idempotency-retention', expect.any(Function));
    expect(service.purgeExpired).toHaveBeenCalledTimes(1);
  });

  it('does not overlap cleanup executions', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    service.purgeExpired.mockImplementationOnce(async () => {
      await gate;
      return 0;
    });

    const first = job.purgeExpiredRecords();
    await job.purgeExpiredRecords();
    release();
    await first;

    expect(service.purgeExpired).toHaveBeenCalledTimes(1);
  });
});
