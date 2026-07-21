import { Test, type TestingModule } from '@nestjs/testing';
import type { OperationAlert, RecommendPackageItem } from '@content/shared';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DashboardService } from '../src/content/dashboard.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AlertService } from '../src/content/alert.service';

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
      gmv: 0
    }
  ])
};

const mockAlertService = {
  rankAlerts: vi
    .fn()
    .mockImplementation((alerts) =>
      alerts.map((a: OperationAlert) => ({ ...a, priorityScore: 0 }))
    ),
  loadResolvedAlertIds: vi.fn().mockResolvedValue(new Set())
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
      { exposureCount: 0, clickCount: 0, orderCount: 0, verifyCount: 0, gmv: 0 }
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
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
        packages: [pkg1, pkg2]
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
        packages: [pkg]
      });

      // Mark ALERT-1 as resolved
      mockAlertService.loadResolvedAlertIds.mockResolvedValueOnce(new Set(['ALERT-1']));

      const result = await service.getTodayOperationConsole(undefined, mockGetRecommendations);

      expect(result.alerts.length).toBe(0);
      expect(result.summary.resolvedAlertCount).toBe(1);
    });

    it('returns empty arrays when there are no packages', async () => {
      const mockGetRecommendations = vi.fn().mockResolvedValue({
        date: '2026-06-10',
        packages: []
      });

      const result = await service.getTodayOperationConsole(undefined, mockGetRecommendations);

      expect(result.summary.sellingCount).toBe(0);
      expect(result.mustPushPackages).toEqual([]);
      expect(result.riskPackages).toEqual([]);
      expect(result.hotOpportunities).toEqual([]);
      expect(result.slowMovingPackages).toEqual([]);
    });
  });

  // ---- getDashboardSummary ----

  describe('getDashboardSummary', () => {
    it('returns counts and GMV aggregated from prisma', async () => {
      mockPrisma.generatedCopy.count
        .mockResolvedValueOnce(50) // generatedCount
        .mockResolvedValueOnce(20) // approvedCount
        .mockResolvedValueOnce(10) // pendingCount
        .mockResolvedValueOnce(3); // riskCount
      mockPrisma.copyPerformance.count.mockResolvedValueOnce(30);
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
        { exposureCount: 5000, clickCount: 800, orderCount: 200, verifyCount: 150, gmv: 19800.5 }
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
      mockPrisma.generatedCopy.count.mockResolvedValue(0);
      mockPrisma.copyPerformance.count.mockResolvedValue(0);
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
        { exposureCount: 0, clickCount: 0, orderCount: 0, verifyCount: 0, gmv: 0 }
      ]);

      const result = await service.getDashboardSummary(vi.fn().mockResolvedValue({ packages: [] }));

      expect(result.contentConversionRate).toBe(0);
      expect(result.verifyConversionRate).toBe(0);
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
