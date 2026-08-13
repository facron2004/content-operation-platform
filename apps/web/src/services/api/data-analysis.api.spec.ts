import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clientGet: vi.fn()
}));

vi.mock('../http-client', () => ({
  default: { get: mocks.clientGet }
}));

import { getDataAnalysisSummary } from './data-analysis.api';

describe('data analysis API reload', () => {
  beforeEach(() => {
    mocks.clientGet.mockReset().mockResolvedValue({ data: { date: '2026-08-05' } });
  });

  it('uses the ordinary summary URL for a normal read', async () => {
    await getDataAnalysisSummary({ window: 'day', date: '2026-08-05' });

    expect(mocks.clientGet).toHaveBeenCalledWith('/data-analysis/summary', {
      params: { window: 'day', date: '2026-08-05' }
    });
  });

  it('sends force on the summary URL while preserving business params', async () => {
    await getDataAnalysisSummary({
      window: 'week',
      date: '2026-08-01',
      endDate: '2026-08-05',
      force: true
    });

    expect(mocks.clientGet).toHaveBeenCalledWith('/data-analysis/summary?force=true', {
      params: { window: 'week', date: '2026-08-01', endDate: '2026-08-05' }
    });
  });
});
