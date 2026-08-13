import { Test, type TestingModule } from '@nestjs/testing';
import type { OperationAlert, RecommendPackageItem } from '@content/shared';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DashboardService } from '../src/content/dashboard.service';
import { DashboardOperationsService } from '../src/content/dashboard-operations.service';
import { DashboardSummaryService } from '../src/content/dashboard-summary.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AlertService } from '../src/content/alert.service';
import { RECOMMEND_CACHE_CAP } from '../src/common/sql-chunk';

// ---- helpers ----

function makePackageItem(overrides: Partial<RecommendPackageItem> = {}): RecommendPackageItem {
  return {
    packageId: 'PKG-DASH-001',
    packageName: '仪表盘测试套餐',
    packageType: 'commission',
    merchantId: 'M001',
    merchantName: '测试门店',
    areaId: 'A001',
    areaName: '测试区域',
    category: '餐饮',
    originalPrice: 200,
    salePrice: 99,
    welfarePrice: null,
    temporarySalePrice: null,
    commissionRate: 0.12,
    grossProfit: 12,
    stockTotal: 100,
    stockLeft: 30,
    startTime: '2026-05-20T00:00:00.000Z',
    endTime: '2026-06-20T00:00:00.000Z',
    useRules: ['需提前预约'],
    sellingPoints: ['双人可用'],
    fallbackPackageId: null,
    miniProgramPath: '/pages/detail?id=PKG-DASH-001',
    saleStatus: 'selling',
    merchantCooperationScore: 85,
    areaMatchScore: 80,
    timeMatchScore: 78,
    historyScore: 75,
    status: 'nearly_sold_out',
    promotionLevel: 'A',
    promotionScore: 82,
    inventoryBacklogDays: 5,
    inventoryPriority: 'backlog_3d',
    inventoryFlag: 'unsold_2d',
    inventoryFlagLabel: '连续2天未售罄',
    inventoryFlagLevel: 'warning',
    inventorySalesFlag: 'observing',
    inventorySalesLabel: '观察中',
    inventorySalesLevel: 'info',
    inventoryObservedDays: 3,
    inventorySoldOutDays: 1,
    inventoryUnsoldDays: 2,
    inventoryTrend: [],
    recommendedStrategy: 'sprint',
    reason: '库存偏低',
    riskTips: [],
    recommendedChannels: ['wechat_group'],
    conversionRate: 0.4,
    verifyRate: 0.77,
    refundRate: 0.025,
    scoreBreakdown: {
      totalScore: 82,
      level: 'A',
      dimensions: []
    },
    operationTags: [],
    operationAlerts: [],
    ...overrides
  } as RecommendPackageItem;
}

// ---- mocks ----

const mockPrisma = {
  generatedCopy: {
    count: vi.fn().mockResolvedValue(0),
    findMany: vi.fn().mockResolvedValue([])
  },
  copyPerformance: {
    count: vi.fn().mockResolvedValue(0),
    findMany: vi.fn().mockResolvedValue([])
  },
  $queryRawUnsafe: vi.fn().mockResolvedValue([
    {
      exposureCount: 0,
      clickCount: 0,
      orderCount: 0,
      verifyCount: 0,
      gmvFen: 0n
    }
  ])
};

const mockAlertService = {
  rankAlerts: vi
    .fn()
    .mockImplementation((alerts) =>
      alerts.map((a: OperationAlert) => ({ ...a, priorityScore: 0 }))
    ),
  loadResolvedAlertIds: vi.fn().mockResolvedValue({
    ids: new Set(),
    truncated: false,
    limit: 5000,
    loaded: 0
  })
};

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset default mock values
    mockPrisma.generatedCopy.count.mockResolvedValue(0);
    mockPrisma.copyPerformance.count.mockResolvedValue(0);
    mockPrisma.generatedCopy.findMany.mockResolvedValue([]);
    mockPrisma.copyPerformance.findMany.mockResolvedValue([]);
    mockPrisma.$queryRawUnsafe.mockResolvedValue([
      { exposureCount: 0, clickCount: 0, orderCount: 0, verifyCount: 0, gmvFen: 0n }
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardOperationsService,
        DashboardSummaryService,
        DashboardService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AlertService, useValue: mockAlertService }
      ]
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  // ---- statusDistribution ----

  describe('statusDistribution', () => {
    it('counts packages by status', () => {
      const packages = [
        makePackageItem({ status: 'nearly_sold_out' }),
        makePackageItem({ packageId: 'PKG-2', status: 'high_refund_risk' }),
        makePackageItem({ packageId: 'PKG-3', status: 'nearly_sold_out' })
      ];

      const dist = service.statusDistribution(packages);

      expect(dist).toEqual({
        nearly_sold_out: 2,
        high_refund_risk: 1
      });
    });

    it('returns empty object for empty array', () => {
      expect(service.statusDistribution([])).toEqual({});
    });

    it('handles single item', () => {
      const dist = service.statusDistribution([makePackageItem({ status: 'healthy_sales' })]);
      expect(dist).toEqual({ healthy_sales: 1 });
    });
  });

  it('aggregates GeneratedCopy status in one grouped query', async () => {
    mockPrisma.$queryRawUnsafe
      .mockResolvedValueOnce([
        { auditStatus: 'approved', cnt: 2 },
        { auditStatus: 'pending', cnt: 3 },
        { auditStatus: 'risk', cnt: 1 }
      ])
      .mockResolvedValueOnce([
        {
          rowCount: 4,
          exposureCount: 100,
          clickCount: 20,
          orderCount: 5,
          verifyCount: 4,
          gmvFen: 12500
        }
      ]);

    const result = await service.getDashboardSummary(
      vi.fn().mockResolvedValue({ date: '2026-08-03', packages: [], matchedCount: 0 })
    );

    expect(result.generatedCount).toBe(6);
    expect(result.approvedCount).toBe(2);
    expect(result.pendingCount).toBe(3);
    expect(result.riskCount).toBe(1);
    expect(result.pushedCount).toBe(4);
    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
    expect(mockPrisma.generatedCopy.count).not.toHaveBeenCalled();
    expect(mockPrisma.copyPerformance.count).not.toHaveBeenCalled();
  });

  // ---- getTodayOperationConsole ----

  describe('getTodayOperationConsole', () => {
    it('returns a summary with selling count and alert counts', async () => {
      const pkg1 = makePackageItem();
      const pkg2 = makePackageItem({
        packageId: 'PKG-DASH-002',
        stockLeft: 0,
        status: 'sold_out'
      });

      const mockGetRecommendations = vi.fn().mockResolvedValue({
        date: '2026-06-10',
        packages: [pkg1, pkg2],
        matchedCount: 2
      });

      const result = await service.getTodayOperationConsole(undefined, mockGetRecommendations);

      expect(result).toHaveProperty('date', '2026-06-10');
      expect(result).toHaveProperty('summary');
      expect(result.summary.sellingCount).toBe(2);
      expect(result.summary).toHaveProperty('mustPushCount');
      expect(result.summary).toHaveProperty('riskCount');
      expect(result.summary).toHaveProperty('avgScore');
      expect(result.summary).toHaveProperty('activeAlertCount');
      expect(result.summary).toHaveProperty('updatedAt');
      expect(result.summary).toHaveProperty('dataSource', 'JeeSite');
    });

    it('uses matchedCount over capped packages.length for sellingCount', async () => {
      // packages array is intentionally truncated (RECOMMEND_CACHE_CAP); KPI must
      // still report the pre-cap selling total when matchedCount is provided.
      const packages = Array.from({ length: 5 }, (_, i) =>
        makePackageItem({ packageId: `PKG-CAP-${i}` })
      );
      const mockGetRecommendations = vi.fn().mockResolvedValue({
        date: '2026-06-10',
        packages,
        matchedCount: 1372
      });

      const result = await service.getTodayOperationConsole(undefined, mockGetRecommendations);

      expect(result.summary.sellingCount).toBe(1372);
      expect(packages).toHaveLength(5);
    });

    it('filters out resolved alerts from the active list', async () => {
      const pkg = makePackageItem({
        operationAlerts: [
          {
            alertId: 'ALERT-1',
            packageId: 'PKG-DASH-001',
            packageName: 'test',
            level: 'warning',
            type: 'low_verify',
            title: '核销偏低',
            reason: '核销率低于50%',
            action: '关注核销',
            merchantName: 'M',
            areaName: 'A'
          } as any
        ]
      });

      const mockGetRecommendations = vi.fn().mockResolvedValue({
        date: '2026-06-10',
        packages: [pkg],
        matchedCount: 1
      });

      // Mark ALERT-1 as resolved
      mockAlertService.loadResolvedAlertIds.mockResolvedValueOnce({
        ids: new Set(['ALERT-1']),
        truncated: false,
        limit: 5000,
        loaded: 1
      });

      const result = await service.getTodayOperationConsole(undefined, mockGetRecommendations);

      expect(result.alerts.length).toBe(0);
      expect(result.summary.resolvedAlertCount).toBe(1);
    });

    it('returns empty arrays when there are no packages', async () => {
      const mockGetRecommendations = vi.fn().mockResolvedValue({
        date: '2026-06-10',
        packages: [],
        matchedCount: 0
      });

      const result = await service.getTodayOperationConsole(undefined, mockGetRecommendations);

      expect(result.summary.sellingCount).toBe(0);
      expect(result.mustPushPackages).toEqual([]);
      expect(result.riskPackages).toEqual([]);
      expect(result.hotOpportunities).toEqual([]);
      expect(result.slowMovingPackages).toEqual([]);
    });

    it('reuses the local payload by default and bypasses it when force is authorized', async () => {
      const mockGetRecommendations = vi.fn().mockResolvedValue({
        date: '2026-06-10',
        packages: [],
        matchedCount: 0
      });

      await service.getTodayOperationConsole(undefined, mockGetRecommendations);
      await service.getTodayOperationConsole(undefined, mockGetRecommendations);
      expect(mockGetRecommendations).toHaveBeenCalledTimes(1);

      await service.getTodayOperationConsole(undefined, mockGetRecommendations, {}, true);
      expect(mockGetRecommendations).toHaveBeenCalledTimes(2);
    });
  });

  // ---- getDashboardSummary ----

  describe('getDashboardSummary', () => {
    it('returns counts and GMV aggregated from prisma', async () => {
      // Residual #125: GROUP BY auditStatus + combined CopyPerformance aggregate.
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          { auditStatus: 'approved', cnt: 20 },
          { auditStatus: 'pending', cnt: 10 },
          { auditStatus: 'risk', cnt: 3 },
          { auditStatus: 'draft', cnt: 17 }
        ])
        .mockResolvedValueOnce([
          {
            rowCount: 30,
            exposureCount: 5000,
            clickCount: 800,
            orderCount: 200,
            verifyCount: 150,
            gmvFen: 1_980_050n
          }
        ]);

      const mockGetRecommendations = vi.fn().mockResolvedValue({ packages: [] });

      const result = await service.getDashboardSummary(mockGetRecommendations);

      expect(result.generatedCount).toBe(50);
      expect(result.approvedCount).toBe(20);
      expect(result.pushedCount).toBe(30);
      expect(result.pendingCount).toBe(10);
      expect(result.riskCount).toBe(3);
      expect(result.totalGmv).toBe(19800.5);
      expect(result.totalClickCount).toBe(800);
      expect(result.contentConversionRate).toBe(0.25); // 200/800
    });

    it('returns zero conversion rate when clickCount is zero', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          rowCount: 0,
          exposureCount: 0,
          clickCount: 0,
          orderCount: 0,
          verifyCount: 0,
          gmvFen: 0n
        }
      ]);

      const result = await service.getDashboardSummary(vi.fn().mockResolvedValue({ packages: [] }));

      expect(result.contentConversionRate).toBe(0);
      expect(result.verifyConversionRate).toBe(0);
    });

    it('projects recommendation source coverage for capped status and package heads', async () => {
      const packages = [
        makePackageItem({ packageId: 'PKG-HEAD-1', status: 'nearly_sold_out' }),
        makePackageItem({ packageId: 'PKG-HEAD-2', status: 'high_refund_risk' })
      ];

      const result = await service.getDashboardSummary(
        vi.fn().mockResolvedValue({ packages, matchedCount: RECOMMEND_CACHE_CAP + 37 }),
        { includePlatformCounters: false }
      );

      expect(result.sourceMatchedCount).toBe(RECOMMEND_CACHE_CAP + 37);
      expect(result.sourceLimit).toBe(RECOMMEND_CACHE_CAP);
      expect(result.sourceTruncated).toBe(true);
      expect(result.statusDistribution).toEqual({
        nearly_sold_out: 1,
        high_refund_risk: 1
      });
      expect(result.topPackages.map((pkg) => pkg.packageId)).toEqual(['PKG-HEAD-1', 'PKG-HEAD-2']);
    });

    it('marks recommendation source failure instead of returning an unmarked empty head', async () => {
      const result = await service.getDashboardSummary(
        vi.fn().mockRejectedValue(new Error('recommendation source down')),
        { includePlatformCounters: false }
      );

      expect(result.sourceError).toBe('推荐源暂不可用，状态分布和套餐榜单未加载');
      expect(result.sourceMatchedCount).toBe(0);
      expect(result.statusDistribution).toEqual({});
      expect(result.topPackages).toEqual([]);
    });

    it('caps CopyPerformance SUM to trailing 90d (date params on createdAt)', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-18T12:00:00+08:00'));
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          rowCount: 1,
          exposureCount: 1,
          clickCount: 1,
          orderCount: 0,
          verifyCount: 0,
          gmvFen: 0n
        }
      ]);

      await service.getDashboardSummary(vi.fn().mockResolvedValue({ packages: [] }));

      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
      // Second call is the CopyPerformance aggregate (COUNT + SUMs).
      const [sql, createdStart, createdEnd] = mockPrisma.$queryRawUnsafe.mock.calls[1];
      expect(String(sql)).toContain('CopyPerformance');
      expect(String(sql)).toMatch(/createdAt/);
      // Exclusive half-open Beijing-day bounds as SQLite space-form params.
      expect(createdStart).toBe('2026-04-19 16:00:00');
      expect(createdEnd).toBe('2026-07-18 16:00:00');
      expect(String(sql)).toContain('datetime(?)');
      vi.useRealTimers();
    });

    it('scopes platform COUNTs to trailing 90d createdAt window', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-18T12:00:00+08:00'));
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          rowCount: 0,
          exposureCount: 0,
          clickCount: 0,
          orderCount: 0,
          verifyCount: 0,
          gmvFen: 0n
        }
      ]);

      await service.getDashboardSummary(vi.fn().mockResolvedValue({ packages: [] }));

      // Residual #125: both raw queries use the same exclusive datetime window.
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
      for (const call of mockPrisma.$queryRawUnsafe.mock.calls) {
        const [, createdStart, createdEnd] = call;
        expect(createdStart).toBe('2026-04-19 16:00:00');
        expect(createdEnd).toBe('2026-07-18 16:00:00');
      }
      // First call groups GeneratedCopy by auditStatus.
      expect(String(mockPrisma.$queryRawUnsafe.mock.calls[0][0])).toMatch(/GeneratedCopy/);
      expect(String(mockPrisma.$queryRawUnsafe.mock.calls[0][0])).toMatch(/GROUP BY "auditStatus"/);
      vi.useRealTimers();
    });
  });

  // ---- getPerformance ----

  describe('getPerformance', () => {
    it('returns items and versionComparison arrays', async () => {
      const mockGetCached = vi.fn().mockResolvedValue({ packages: [] });

      const result = await service.getPerformance(mockGetCached);

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('versionComparison');
      expect(result).toHaveProperty('review');
      expect(Array.isArray(result.items)).toBe(true);
    });
  });
});
