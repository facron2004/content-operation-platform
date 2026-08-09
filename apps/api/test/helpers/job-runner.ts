import { vi } from 'vitest';

export function createJobRunnerMock() {
  return {
    runJob: vi.fn(
      async (
        _jobName: string,
        jobFn: (setMeta: (meta: Record<string, unknown>) => void) => Promise<number | void>
      ) => jobFn(() => undefined)
    )
  };
}
