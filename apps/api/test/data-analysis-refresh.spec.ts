import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import { DataAnalysisController } from '../src/data-analysis/data-analysis.controller';
import type { DataAnalysisSummary } from '../src/data-analysis/data-analysis.dto';
import { DataAnalysisService } from '../src/data-analysis/data-analysis.service';
import type { DataFreshnessService } from '../src/data-analysis/data-freshness.service';
import type { PrismaService } from '../src/prisma/prisma.service';

function request(role: 'admin' | 'auditor', query: Record<string, unknown>): Request {
  return { user: { roles: [role] }, query } as unknown as Request;
}

function summary(date: string): DataAnalysisSummary {
  return { date, endDate: date } as DataAnalysisSummary;
}

describe('data-analysis real reload', () => {
  it('passes an authorized force signal and keeps ordinary or read-only role requests cached', () => {
    const service = { getSummary: vi.fn() } as unknown as DataAnalysisService;
    const controller = new DataAnalysisController(service, {} as DataFreshnessService);

    controller.summary(
      { window: 'day', date: '2026-08-12', force: 'true' },
      request('admin', { force: 'true' })
    );
    controller.summary({ window: 'day', date: '2026-08-12' }, request('admin', {}));
    controller.summary(
      { window: 'day', date: '2026-08-12', force: 'true' },
      request('auditor', { force: 'true' })
    );

    expect(service.getSummary).toHaveBeenNthCalledWith(
      1,
      'day',
      '2026-08-12',
      undefined,
      undefined,
      undefined,
      true
    );
    expect(service.getSummary).toHaveBeenNthCalledWith(
      2,
      'day',
      '2026-08-12',
      undefined,
      undefined,
      undefined,
      false
    );
    expect(service.getSummary).toHaveBeenNthCalledWith(
      3,
      'day',
      '2026-08-12',
      undefined,
      undefined,
      undefined,
      false
    );
  });

  it('reuses the 30s summary value for ordinary reads and recomputes when forced', async () => {
    const service = new DataAnalysisService({} as PrismaService);
    type TestableService = { buildSummary: () => Promise<DataAnalysisSummary> };
    const buildSummary = vi
      .spyOn(service as unknown as TestableService, 'buildSummary')
      .mockResolvedValueOnce(summary('cached'))
      .mockResolvedValueOnce(summary('forced'));

    const first = await service.getSummary('day', '2026-08-12');
    const cached = await service.getSummary('day', '2026-08-12');
    const forced = await service.getSummary(
      'day',
      '2026-08-12',
      undefined,
      undefined,
      undefined,
      true
    );

    expect(first.date).toBe('cached');
    expect(cached.date).toBe('cached');
    expect(forced.date).toBe('forced');
    expect(buildSummary).toHaveBeenCalledTimes(2);
  });
});
