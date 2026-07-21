import { Test, type TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import type { ContentPackage, SalesSnapshot } from '@content/shared';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ContentService } from '../src/content/content.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { DataSourceService } from '../src/content/data-source.service';
import { PackageDetailService } from '../src/content/package-detail';
import { AICopyService } from '../src/content/ai-copy';
import { DailyInventoryCrawlerService } from '../src/content/daily-inventory-crawler.service';
import { CopyService } from '../src/content/copy.service';
import { AlertService } from '../src/content/alert.service';
import { DashboardService } from '../src/content/dashboard.service';

// ---- fixtures ----

const fixturePackage: ContentPackage = {
  packageId: 'PKG-TEST-001',
  packageName: '测试双人套餐',
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
  miniProgramPath: '/pages/detail?id=PKG-TEST-001',
  detailSummary: '',
  saleStatus: 'selling',
  merchantCooperationScore: 85,
  areaMatchScore: 80,
  timeMatchScore: 78,
  historyScore: 75
};

const fixtureSnapshot: SalesSnapshot = {
  packageId: 'PKG-TEST-001',
  areaId: 'A001',
  merchantId: 'M001',
  snapshotTime: '2026-06-09T10:00:00.000Z',
  exposureCount: 1500,
  clickCount: 200,
  orderCount: 80,
  paidOrderCount: 78,
  refundCount: 2,
  verifyCount: 60,
  gmv: 7920,
  paidAmount: 7722,
  refundAmount: 198,
  conversionRate: 0.4,
  verifyRate: 0.77,
  refundRate: 0.025,
  sellThroughRate: 0.7,
  remainingStock: 30,
  salesSpeed: 6
};

const fixturePackage2: ContentPackage = {
  ...fixturePackage,
  packageId: 'PKG-TEST-002',
  packageName: '测试单人套餐',
  stockLeft: 5,
  saleStatus: 'selling',
  category: '丽人'
};

const fixtureSnapshot2: SalesSnapshot = {
  ...fixtureSnapshot,
  packageId: 'PKG-TEST-002',
  remainingStock: 5,
  exposureCount: 800,
  clickCount: 100,
  orderCount: 50
};

// ---- mocks ----

const mockPrisma = {};

const mockDataSource = {
  loadDataset: vi.fn().mockResolvedValue({
    packages: [fixturePackage, fixturePackage2],
    snapshots: [fixtureSnapshot, fixtureSnapshot2]
  })
};

const mockPackageDetailService = {
  fetchPackageDetail: vi.fn().mockResolvedValue(null)
};

const mockAICopyService = {
  getStatus: vi.fn().mockReturnValue({ enabled: false }),
  updateConfig: vi.fn().mockResolvedValue({}),
  generateCopies: vi.fn().mockResolvedValue([])
};

const mockDailyInventoryCrawler = {
  crawlDailyInventory: vi.fn().mockResolvedValue({ recorded: 0 }),
  loadRecentInventoryTrends: vi.fn().mockResolvedValue(new Map()),
  mergeLiveSnapshots: vi.fn().mockImplementation((trends) => trends)
};

const mockCopyService = {
  generateCopies: vi.fn().mockResolvedValue({ contentList: [] }),
  listCopies: vi.fn().mockResolvedValue({ items: [] }),
  auditCopy: vi.fn().mockResolvedValue({})
};

const mockAlertService = {
  getOperationAlerts: vi.fn().mockResolvedValue({ items: [] }),
  resolveOperationAlert: vi.fn().mockResolvedValue({ success: true }),
  resolveOperationAlerts: vi.fn().mockResolvedValue({ success: true })
};

const mockDashboardService = {
  getTodayOperationConsole: vi.fn().mockResolvedValue({}),
  getDashboardSummary: vi.fn().mockResolvedValue({}),
  getPerformance: vi.fn().mockResolvedValue({})
};

describe('ContentService', () => {
  let service: ContentService;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset dataset mock to default
    mockDataSource.loadDataset.mockResolvedValue({
      packages: [fixturePackage, fixturePackage2],
      snapshots: [fixtureSnapshot, fixtureSnapshot2]
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DataSourceService, useValue: mockDataSource },
        { provide: PackageDetailService, useValue: mockPackageDetailService },
        { provide: AICopyService, useValue: mockAICopyService },
        { provide: DailyInventoryCrawlerService, useValue: mockDailyInventoryCrawler },
        { provide: CopyService, useValue: mockCopyService },
        { provide: AlertService, useValue: mockAlertService },
        { provide: DashboardService, useValue: mockDashboardService }
      ]
    }).compile();

    service = module.get<ContentService>(ContentService);
  });

  // ---- getRecommendations ----

  describe('getRecommendations', () => {
    it('returns packages with scores and inventory data', async () => {
      const result = await service.getRecommendations({ status: 'selling' });

      expect(result).toHaveProperty('date');
      expect(result).toHaveProperty('areaId');
      expect(result.packages.length).toBeGreaterThan(0);
      const first = result.packages[0];
      expect(first).toHaveProperty('promotionScore');
      expect(first).toHaveProperty('inventoryFlag');
      expect(first).toHaveProperty('inventoryBacklogDays');
      expect(first).toHaveProperty('scoreBreakdown');
      expect(first).toHaveProperty('operationTags');
    });

    it('filters by category', async () => {
      const result = await service.getRecommendations({ status: 'selling', category: '丽人' });

      for (const pkg of result.packages) {
        expect(pkg.category).toBe('丽人');
      }
    });

    it('filters by inventoryMin', async () => {
      const result = await service.getRecommendations({ status: 'selling', inventoryMin: 10 });

      for (const pkg of result.packages) {
        expect(pkg.stockLeft).toBeGreaterThanOrEqual(10);
      }
    });

    it('filters by inventoryMax', async () => {
      const result = await service.getRecommendations({ status: 'selling', inventoryMax: 10 });

      for (const pkg of result.packages) {
        expect(pkg.stockLeft).toBeLessThanOrEqual(10);
      }
    });

    it('returns empty list when no packages match filter', async () => {
      const result = await service.getRecommendations({
        status: 'selling',
        category: '不存在的分类'
      });

      expect(result.packages).toHaveLength(0);
    });

    it('filters by areaId', async () => {
      const result = await service.getRecommendations({ areaId: 'A001' });

      expect(result.areaId).toBe('A001');
      expect(result.packages.length).toBeGreaterThan(0);
    });

    it('returns areaId "all" when no area specified', async () => {
      const result = await service.getRecommendations({});

      expect(result.areaId).toBe('all');
    });

    it('caches recommendations and deduplicates in-flight requests', async () => {
      const first = service.getRecommendations({ status: 'selling' });
      const second = service.getRecommendations({ status: 'selling' });

      const [r1, r2] = await Promise.all([first, second]);
      // Both calls should return the same result (from cache / in-flight dedup)
      expect(r1.packages.length).toBe(r2.packages.length);
      // loadDataset called only once because of dedup
      expect(mockDataSource.loadDataset).toHaveBeenCalledTimes(1);
    });

    it('perf: 200 packages complete batch compute in < 500ms', async () => {
      // 临时构造 200 个 selling 套餐,测量 buildRecommendPackageItems 的实际开销。
      // 阈值 500ms 给 CI 留余量;若未来重构引入 N+1,本断言会立刻失败。
      const N = 200;
      const bigPackages = Array.from({ length: N }, (_, i) => ({
        ...fixturePackage,
        packageId: `PKG-PERF-${i}`,
        stockLeft: i % 5,
        stockTotal: 100
      }));
      const bigSnapshots = Array.from({ length: N }, (_, i) => ({
        ...fixtureSnapshot,
        packageId: `PKG-PERF-${i}`
      }));
      mockDataSource.loadDataset.mockResolvedValueOnce({
        packages: bigPackages,
        snapshots: bigSnapshots
      });

      const start = performance.now();
      const result = await service.getRecommendations({ status: 'selling' });
      const elapsed = performance.now() - start;

      expect(result.packages.length).toBe(N);
      expect(elapsed).toBeLessThan(500);
    });
  });

  // ---- getCategories ----

  describe('getCategories', () => {
    it('returns deduplicated sorted categories from cached recommendations', async () => {
      // Warm the cache first
      await service.getRecommendations({ status: 'selling' });
      const result = await service.getCategories({});

      expect(result).toHaveProperty('categories');
      expect(Array.isArray(result.categories)).toBe(true);
      // Categories should be sorted and unique
      const set = new Set(result.categories);
      expect(set.size).toBe(result.categories.length);
    });

    it('returns empty categories when cache is empty and call fails', async () => {
      mockDataSource.loadDataset.mockRejectedValueOnce(new Error('API down'));
      const result = await service.getCategories({});

      expect(result.categories).toEqual([]);
    });
  });

  // ---- invalidateRecommendationCache ----

  describe('invalidateRecommendationCache', () => {
    it('clears the cache so next call recomputes', async () => {
      // Warm cache
      await service.getRecommendations({ status: 'selling' });
      expect(mockDataSource.loadDataset).toHaveBeenCalledTimes(1);

      // Invalidate
      service.invalidateRecommendationCache();

      // Next call should recompute
      await service.getRecommendations({ status: 'selling' });
      expect(mockDataSource.loadDataset).toHaveBeenCalledTimes(2);
    });
  });

  // ---- getPackageAnalysis ----

  describe('getPackageAnalysis', () => {
    it('returns full analysis for a valid package', async () => {
      const result = await service.getPackageAnalysis('PKG-TEST-001');

      expect(result.package.packageId).toBe('PKG-TEST-001');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('promotionScore');
      expect(result).toHaveProperty('inventoryFlag');
      expect(result).toHaveProperty('scoreBreakdown');
      expect(result).toHaveProperty('operationTags');
      expect(result).toHaveProperty('recommendation');
      expect(result.recommendation).toHaveProperty('strategy');
      expect(result.recommendation).toHaveProperty('reason');
      expect(result.recommendation).toHaveProperty('suggestedChannels');
      expect(result.recommendation).toHaveProperty('riskTips');
      expect(result.recommendation).toHaveProperty('copyAngles');
      expect(result).toHaveProperty('trends');
      expect(result.trends.length).toBe(6);
      expect(result.trends[0].label).toBe('曝光');
    });

    it('throws NotFoundException for non-existent package', async () => {
      mockDataSource.loadDataset.mockResolvedValueOnce({
        packages: [],
        snapshots: []
      });

      await expect(service.getPackageAnalysis('NON-EXISTENT')).rejects.toThrow(NotFoundException);
    });

    it('includes salesData snapshot in the result', async () => {
      const result = await service.getPackageAnalysis('PKG-TEST-001');

      expect(result.salesData).toBeDefined();
      expect(result.salesData.packageId).toBe('PKG-TEST-001');
      expect(result.salesData.exposureCount).toBe(1500);
    });
  });

  // ---- delegation methods ----
  // P5 拆分后,ContentService 不再转发这些方法;controller 直接依赖领域 service。
  // 转发行为的测试责任随之迁移到对应 controller 测试 (暂无 e2e 覆盖)。
  describe('delegation methods', () => {
    it('getAICopyStatus delegates to aiCopyService', () => {
      service.getAICopyStatus();
      expect(mockAICopyService.getStatus).toHaveBeenCalled();
    });
  });

  // ---- getCommunities ----

  describe('getCommunities', () => {
    it('returns items array derived from selling packages', async () => {
      const result = await service.getCommunities();

      expect(result).toHaveProperty('items');
      expect(Array.isArray(result.items)).toBe(true);
    });
  });

  // ---- generateBattleCard ----

  describe('generateBattleCard', () => {
    it('throws NotFoundException when package does not exist', async () => {
      // Force empty recommendations
      mockDataSource.loadDataset.mockResolvedValue({
        packages: [],
        snapshots: []
      });

      await expect(service.generateBattleCard('NON-EXISTENT')).rejects.toThrow(NotFoundException);
    });

    it('returns a battle card for a valid package', async () => {
      const card = await service.generateBattleCard('PKG-TEST-001');

      expect(card).toBeDefined();
      // buildBattleCard returns an object with communityCopy, soldOutFallbackCopy etc.
      expect(card).toHaveProperty('communityCopy');
    });
  });
});
