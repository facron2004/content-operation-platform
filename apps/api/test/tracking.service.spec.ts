import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { TrackingService } from '../src/attribution/tracking.service';

function livePublishedRow(overrides: Record<string, unknown> = {}) {
  return {
    taskId: 'task_1',
    packageId: 'pkg_1',
    status: 'published',
    channel: 'wechat_group',
    // Recent enough to be inside the 24h wechat_group window.
    publishedAt: new Date().toISOString(),
    completedAt: null,
    ...overrides
  };
}

describe('TrackingService', () => {
  const prisma = {
    $queryRawUnsafe: vi.fn(),
    $executeRawUnsafe: vi.fn()
  };
  let svc: TrackingService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new TrackingService(prisma as never);
  });

  it('handleRedirect inserts visitId/taskId/visitTime columns', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([livePublishedRow()]);
    prisma.$executeRawUnsafe.mockResolvedValueOnce(1);

    const result = await svc.handleRedirect('abc123');
    expect(result).toEqual({ packageId: 'pkg_1', url: '/package/pkg_1' });

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    const [sql, visitId, taskId, trackingCode, visitorId, referrer, ip, userAgent, visitTime] =
      prisma.$executeRawUnsafe.mock.calls[0];
    expect(String(sql)).toContain('"visitId"');
    expect(String(sql)).toContain('"taskId"');
    expect(String(sql)).toContain('"visitTime"');
    expect(String(sql)).not.toContain('"createdAt"');
    expect(visitId).toMatch(/^visit_/);
    expect(taskId).toBe('task_1');
    expect(trackingCode).toBe('abc123');
    expect(visitorId).toBeNull();
    expect(referrer).toBeNull();
    expect(ip).toBeNull();
    expect(userAgent).toBeNull();
    expect(typeof visitTime).toBe('string');
  });

  it('handleRedirect rejects non-live task status', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([livePublishedRow({ status: 'draft' })]);
    await expect(svc.handleRedirect('abc123')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('handleRedirect rejects completed tasks even mid channel window', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      livePublishedRow({ status: 'completed', completedAt: new Date().toISOString() })
    ]);
    await expect(svc.handleRedirect('abc123')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('handleRedirect rejects expired channel window', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      livePublishedRow({
        // wechat_group window is 24h — publish 3 days ago is closed.
        publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      })
    ]);
    await expect(svc.handleRedirect('abc123')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('recordVisit rejects unknown tracking codes', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([]);
    await expect(svc.recordVisit({ trackingCode: 'missing' })).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('recordVisit stamps server fields and ignores client visitorId', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      livePublishedRow({ taskId: 'task_9', packageId: 'pkg_9' })
    ]);
    prisma.$executeRawUnsafe.mockResolvedValueOnce(1);

    // Simulate a malicious client body that still ships visitorId even though
    // RecordVisitDto no longer accepts it (controller pipe would strip it).
    await svc.recordVisit({
      trackingCode: 'code99',
      referrer: 'https://example.com',
      ip: '1.2.3.4',
      userAgent: 'vitest',
      // @ts-expect-error — client-supplied visitorId must never reach insert
      visitorId: 'mem_1'
    });

    const [sql, , taskId, trackingCode, visitorId, referrer, ip, userAgent] =
      prisma.$executeRawUnsafe.mock.calls[0];
    expect(String(sql)).toMatch(/INSERT INTO "TrackingVisit"/);
    expect(taskId).toBe('task_9');
    expect(trackingCode).toBe('code99');
    // Public ingest must not persist client-supplied visitorId (order-theft vector).
    expect(visitorId).toBeNull();
    expect(referrer).toBe('https://example.com');
    expect(ip).toBe('1.2.3.4');
    expect(userAgent).toBe('vitest');
  });
});
