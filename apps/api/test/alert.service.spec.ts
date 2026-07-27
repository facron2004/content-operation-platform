import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import type { OperationAlert } from '@content/shared';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AlertService } from '../src/content/alert.service';
import { PrismaService } from '../src/prisma/prisma.service';

// ---- helpers ----

function makeAlert(overrides: Partial<OperationAlert> = {}): OperationAlert {
  return {
    alertId: 'ALERT-001',
    packageId: 'PKG-001',
    packageName: '测试套餐',
    merchantName: '测试门店',
    areaName: '测试区域',
    level: 'warning',
    type: 'low_verify',
    title: '核销率偏低',
    reason: '核销率低于50%',
    action: '关注核销情况',
    ...overrides
  } as OperationAlert;
}

// ---- mocks ----

const mockPrisma = {
  operationAlertResolution: {
    findMany: vi.fn().mockResolvedValue([]),
    upsert: vi.fn().mockResolvedValue({})
  },
  // Interactive $transaction(callback) for residual #97 bulk resolve; array form still works.
  $transaction: vi.fn().mockImplementation(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: typeof mockPrisma) => Promise<unknown>)(mockPrisma);
    }
    return Promise.all(arg as Promise<unknown>[]);
  }),
  $executeRawUnsafe: vi.fn().mockResolvedValue(0),
  $queryRawUnsafe: vi.fn().mockResolvedValue([])
};

describe('AlertService', () => {
  let service: AlertService;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrisma.operationAlertResolution.findMany.mockResolvedValue([]);
    mockPrisma.operationAlertResolution.upsert.mockResolvedValue({});
    // Interactive $transaction(callback) — residual #97 bulk resolve.
    mockPrisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: typeof mockPrisma) => Promise<unknown>)(mockPrisma);
      }
      return Promise.all(arg as Promise<unknown>[]);
    });
    mockPrisma.$executeRawUnsafe.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [AlertService, { provide: PrismaService, useValue: mockPrisma }]
    }).compile();

    service = module.get<AlertService>(AlertService);
  });

  // ---- alertPriorityScore ----

  describe('alertPriorityScore', () => {
    it('assigns highest score to danger + high_refund', () => {
      const alert = makeAlert({ level: 'danger', type: 'high_refund' });
      const score = service.alertPriorityScore(alert);
      // danger = 80, high_refund = 20 => 100
      expect(score).toBe(100);
    });

    it('assigns medium score to warning + continuous_unsold', () => {
      const alert = makeAlert({ level: 'warning', type: 'continuous_unsold' });
      const score = service.alertPriorityScore(alert);
      // warning = 52, continuous_unsold = 18 => 70
      expect(score).toBe(70);
    });

    it('assigns lower score to info + missing_selling_points', () => {
      const alert = makeAlert({ level: 'info', type: 'missing_selling_points' });
      const score = service.alertPriorityScore(alert);
      // info = 20, missing_selling_points = 4 => 24
      expect(score).toBe(24);
    });

    it('returns base score for unknown type', () => {
      const alert = makeAlert({ level: 'danger', type: 'some_unknown_type' as any });
      const score = service.alertPriorityScore(alert);
      // danger = 80, unknown = 0
      expect(score).toBe(80);
    });
  });

  // ---- rankAlerts ----

  describe('rankAlerts', () => {
    it('sorts alerts by priority score descending', () => {
      const alerts = [
        makeAlert({ alertId: 'A1', level: 'info', type: 'missing_selling_points' }),
        makeAlert({ alertId: 'A2', level: 'danger', type: 'high_refund' }),
        makeAlert({ alertId: 'A3', level: 'warning', type: 'low_verify' })
      ];

      const ranked = service.rankAlerts(alerts);

      expect(ranked[0].alertId).toBe('A2'); // danger + high_refund = 100
      expect(ranked[1].alertId).toBe('A3'); // warning + low_verify = 64
      expect(ranked[2].alertId).toBe('A1'); // info + missing_selling_points = 24
    });

    it('adds priorityScore to each alert', () => {
      const ranked = service.rankAlerts([makeAlert()]);
      expect(ranked[0]).toHaveProperty('priorityScore');
    });

    it('returns empty array for empty input', () => {
      expect(service.rankAlerts([])).toEqual([]);
    });
  });

  // ---- filterAlerts ----

  describe('filterAlerts', () => {
    const alerts = [
      makeAlert({ alertId: 'A1', level: 'danger', type: 'high_refund', packageName: '套餐A' }),
      makeAlert({ alertId: 'A2', level: 'warning', type: 'low_verify', packageName: '套餐B' }),
      makeAlert({
        alertId: 'A3',
        level: 'info',
        type: 'missing_selling_points',
        packageName: '套餐C'
      })
    ];

    it('filters by level', () => {
      const result = service.filterAlerts(alerts, { level: 'danger' });
      expect(result).toHaveLength(1);
      expect(result[0].alertId).toBe('A1');
    });

    it('filters by type', () => {
      const result = service.filterAlerts(alerts, { type: 'low_verify' });
      expect(result).toHaveLength(1);
      expect(result[0].alertId).toBe('A2');
    });

    it('filters by keyword across multiple fields', () => {
      const result = service.filterAlerts(alerts, { keyword: '套餐A' });
      expect(result).toHaveLength(1);
      expect(result[0].alertId).toBe('A1');
    });

    it('keyword is case insensitive', () => {
      const result = service.filterAlerts(alerts, { keyword: '套餐a' });
      // '套餐A' should not match '套餐a' in case-insensitive? Actually, Chinese characters
      // don't have case, but the toLowerCase() call won't hurt
      expect(result).toHaveLength(1);
    });

    it('returns all alerts when no filters are applied', () => {
      const result = service.filterAlerts(alerts, {});
      expect(result).toHaveLength(3);
    });
  });

  // ---- buildAlertSummary ----

  describe('buildAlertSummary', () => {
    it('returns correct counts by level', () => {
      const allAlerts = [
        makeAlert({ alertId: 'A1', level: 'danger' }),
        makeAlert({ alertId: 'A2', level: 'warning' }),
        makeAlert({ alertId: 'A3', level: 'info' }),
        makeAlert({ alertId: 'A4', level: 'danger' })
      ];
      // Suppose A4 was resolved
      const activeAlerts = allAlerts.slice(0, 3);

      const summary = service.buildAlertSummary(allAlerts, activeAlerts);

      expect(summary).toMatchObject({
        totalCount: 4,
        activeCount: 3,
        resolvedCount: 1,
        dangerCount: 1,
        warningCount: 1,
        infoCount: 1
      });
    });

    it('includes typeDistribution in the summary', () => {
      const alerts = [
        makeAlert({ alertId: 'A1', type: 'high_refund' }),
        makeAlert({ alertId: 'A2', type: 'high_refund' }),
        makeAlert({ alertId: 'A3', type: 'low_verify' })
      ];

      const summary = service.buildAlertSummary(alerts, alerts);

      expect(summary.typeDistribution).toEqual({
        high_refund: 2,
        low_verify: 1
      });
    });

    it('counts unique packages', () => {
      const alerts = [
        makeAlert({ alertId: 'A1', packageId: 'PKG-1' }),
        makeAlert({ alertId: 'A2', packageId: 'PKG-1' }),
        makeAlert({ alertId: 'A3', packageId: 'PKG-2' })
      ];

      const summary = service.buildAlertSummary(alerts, alerts);
      expect(summary.packageCount).toBe(2);
    });
  });

  // ---- buildAlertPackageFocus ----

  describe('buildAlertPackageFocus', () => {
    it('groups alerts by packageId and returns top 8 with honesty', () => {
      const alerts: OperationAlert[] = [];
      for (let i = 0; i < 10; i++) {
        alerts.push(
          makeAlert({
            alertId: `ALERT-${i}`,
            packageId: `PKG-${i}`,
            level: 'danger',
            type: 'high_refund'
          })
        );
      }

      const focus = service.buildAlertPackageFocus(alerts);
      // Residual #283: object return with Top-8 head + matched/truncated honesty.
      expect(focus.items.length).toBe(8);
      expect(focus.limit).toBe(8);
      expect(focus.matched).toBe(10);
      expect(focus.truncated).toBe(true);
    });

    it('aggregates alert counts for the same package', () => {
      const alerts = [
        makeAlert({ alertId: 'A1', packageId: 'PKG-1', level: 'danger', type: 'high_refund' }),
        makeAlert({ alertId: 'A2', packageId: 'PKG-1', level: 'warning', type: 'low_verify' }),
        makeAlert({
          alertId: 'A3',
          packageId: 'PKG-2',
          level: 'info',
          type: 'missing_selling_points'
        })
      ];

      const focus = service.buildAlertPackageFocus(alerts);

      const pkg1 = focus.items.find((f) => f.packageId === 'PKG-1');
      expect(pkg1).toBeDefined();
      expect(pkg1!.alertCount).toBe(2);
      expect(pkg1!.dangerCount).toBe(1);
      expect(pkg1!.warningCount).toBe(1);
      expect(pkg1!.types).toEqual(expect.arrayContaining(['high_refund', 'low_verify']));
      expect(focus.matched).toBe(2);
      expect(focus.truncated).toBe(false);
    });
  });

  // ---- resolveOperationAlert ----

  describe('resolveOperationAlert', () => {
    it('throws BadRequestException when alertId is empty', async () => {
      await expect(service.resolveOperationAlert('', 'admin')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when alertId shape is invalid', async () => {
      await expect(service.resolveOperationAlert('ALERT-001', 'admin')).rejects.toThrow(
        BadRequestException
      );
    });

    it('upserts resolution record and returns success', async () => {
      const result = await service.resolveOperationAlert('PKG-1:high_refund', 'admin');

      expect(result.success).toBe(true);
      expect(result.alertId).toBe('PKG-1:high_refund');
      expect(result.message).toContain('已处理');
      expect(mockPrisma.operationAlertResolution.upsert).toHaveBeenCalled();
    });
  });

  // ---- resolveOperationAlerts (batch) ----

  describe('resolveOperationAlerts', () => {
    it('throws BadRequestException when alertIds is empty', async () => {
      await expect(service.resolveOperationAlerts([], 'admin')).rejects.toThrow(
        BadRequestException
      );
    });

    it('deduplicates and trims alertIds', async () => {
      const result = await service.resolveOperationAlerts(
        ['PKG-1:high_refund', ' PKG-1:high_refund ', 'PKG-2:low_verify', '', '  '],
        'admin'
      );

      expect(result.success).toBe(true);
      expect(result.resolvedCount).toBe(2);
      expect(result.alertIds).toEqual(['PKG-1:high_refund', 'PKG-2:low_verify']);
    });

    it('bulk-inserts via multi-row INSERT ON CONFLICT (not N serial upserts)', async () => {
      await service.resolveOperationAlerts(['PKG-1:high_refund', 'PKG-2:low_verify'], 'admin');

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      // Interactive callback form (not Prisma-promise array of N upserts).
      expect(typeof mockPrisma.$transaction.mock.calls[0][0]).toBe('function');
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalled();
      const sql = String(mockPrisma.$executeRawUnsafe.mock.calls[0][0]);
      expect(sql).toMatch(/INSERT INTO "OperationAlertResolution"/);
      expect(sql).toMatch(/VALUES\s+\(\?,\s*\?,\s*\?,\s*\?\),\s*\(\?,\s*\?,\s*\?,\s*\?\)/);
      expect(sql).toMatch(/ON CONFLICT\("alertId", "resolvedDate"\)/);
      // Two alert rows → 2×4 params after SQL string.
      expect(mockPrisma.$executeRawUnsafe.mock.calls[0].length - 1).toBe(8);
    });
  });

  // ---- getOperationAlerts ----

  describe('getOperationAlerts', () => {
    it('returns paginated alerts with summary and pagination info', async () => {
      const alerts = [
        makeAlert({ alertId: 'A1', level: 'danger', type: 'high_refund' }),
        makeAlert({ alertId: 'A2', level: 'warning', type: 'low_verify' })
      ];
      const mockGetRecommendations = vi.fn().mockResolvedValue({
        date: '2026-06-10',
        packages: [{ operationAlerts: alerts }]
      });

      const result = await service.getOperationAlerts(
        { page: 1, pageSize: 10 },
        mockGetRecommendations
      );

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('pagination');
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.pageSize).toBe(10);
      expect(result.items.length).toBeGreaterThan(0);
    });

    it('filters out resolved alerts', async () => {
      const alerts = [makeAlert({ alertId: 'A1' }), makeAlert({ alertId: 'A2' })];
      const mockGetRecommendations = vi.fn().mockResolvedValue({
        date: '2026-06-10',
        packages: [{ operationAlerts: alerts }]
      });

      // Mark A1 as resolved
      mockPrisma.operationAlertResolution.findMany.mockResolvedValueOnce([{ alertId: 'A1' }]);

      const result = await service.getOperationAlerts({}, mockGetRecommendations);

      expect(result.items.find((a: OperationAlert) => a.alertId === 'A1')).toBeUndefined();
    });

    it('reuses ranked aggregate across page flips without re-calling recommend', async () => {
      const alerts = Array.from({ length: 3 }, (_, i) =>
        makeAlert({ alertId: `A${i + 1}`, level: 'warning', type: 'low_verify' })
      );
      const mockGetRecommendations = vi.fn().mockResolvedValue({
        date: '2026-06-10',
        packages: [{ operationAlerts: alerts }]
      });

      const page1 = await service.getOperationAlerts(
        { page: 1, pageSize: 1 },
        mockGetRecommendations,
        { areaIds: ['a1'] }
      );
      const page2 = await service.getOperationAlerts(
        { page: 2, pageSize: 1 },
        mockGetRecommendations,
        { areaIds: ['a1'] }
      );

      expect(mockGetRecommendations).toHaveBeenCalledTimes(1);
      expect(page1.items).toHaveLength(1);
      expect(page2.items).toHaveLength(1);
      expect(page1.items[0].alertId).not.toBe(page2.items[0].alertId);
      expect(page1.pagination.total).toBe(3);
      expect(page2.pagination.total).toBe(3);
    });
  });

  // ---- loadResolvedAlertIds ----

  describe('loadResolvedAlertIds', () => {
    it('returns a Set of resolved alert IDs for the given date', async () => {
      mockPrisma.operationAlertResolution.findMany.mockResolvedValueOnce([
        { alertId: 'A1' },
        { alertId: 'A2' }
      ]);

      const result = await service.loadResolvedAlertIds('2026-06-10');

      // Residual #274: returns { ids, truncated, limit, loaded }.
      expect(result.ids).toBeInstanceOf(Set);
      expect(result.ids.size).toBe(2);
      expect(result.ids.has('A1')).toBe(true);
      expect(result.ids.has('A2')).toBe(true);
      expect(result.truncated).toBe(false);
      expect(result.loaded).toBe(2);
      expect(result.limit).toBeGreaterThan(0);
    });
  });
});
