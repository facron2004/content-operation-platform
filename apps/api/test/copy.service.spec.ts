import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ContentPackage, SalesSnapshot } from '@content/shared';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CopyService } from '../src/content/copy.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { DataSourceService } from '../src/content/data-source.service';
import { PackageDetailService } from '../src/content/package-detail';
import { AICopyService } from '../src/content/ai-copy';

// ---- fixtures ----

const fixturePackage: ContentPackage = {
  packageId: 'PKG-COPY-001',
  packageName: '文案测试套餐',
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
  miniProgramPath: '/pages/detail?id=PKG-COPY-001',
  detailSummary: '',
  saleStatus: 'selling',
  merchantCooperationScore: 85,
  areaMatchScore: 80,
  timeMatchScore: 78,
  historyScore: 75
};

const fixtureSnapshot: SalesSnapshot = {
  packageId: 'PKG-COPY-001',
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

// ---- mocks ----

const mockPrisma = {
  generatedCopy: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    update: vi.fn().mockResolvedValue({}),
    count: vi.fn().mockResolvedValue(0)
  },
  contentPackage: {
    upsert: vi.fn().mockResolvedValue({}),
    findUnique: vi.fn().mockResolvedValue(null)
  }
};

const mockDataSource = {
  loadDataset: vi.fn().mockResolvedValue({
    packages: [fixturePackage],
    snapshots: [fixtureSnapshot]
  })
};

const mockPackageDetailService = {
  fetchPackageDetail: vi.fn().mockResolvedValue(null)
};

const mockAICopyService = {
  generateCopies: vi.fn().mockResolvedValue([])
};

describe('CopyService', () => {
  let service: CopyService;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset to defaults
    mockDataSource.loadDataset.mockResolvedValue({
      packages: [fixturePackage],
      snapshots: [fixtureSnapshot]
    });
    mockPrisma.generatedCopy.findMany.mockResolvedValue([]);
    mockPrisma.generatedCopy.findUnique.mockResolvedValue(null);
    mockPrisma.generatedCopy.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.generatedCopy.update.mockResolvedValue({});
    mockPrisma.contentPackage.upsert.mockResolvedValue({});
    mockPrisma.contentPackage.findUnique.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CopyService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DataSourceService, useValue: mockDataSource },
        { provide: PackageDetailService, useValue: mockPackageDetailService },
        { provide: AICopyService, useValue: mockAICopyService }
      ]
    }).compile();

    service = module.get<CopyService>(CopyService);
  });

  // ---- generateCopies ----

  describe('generateCopies', () => {
    it('throws BadRequestException when packageId is missing', async () => {
      await expect(
        service.generateCopies({
          packageId: '',
          channel: 'wechat_group',
          copyCount: 2,
          createdBy: 'tester'
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when channel is missing', async () => {
      await expect(
        service.generateCopies({
          packageId: 'PKG-COPY-001',
          channel: '' as any,
          copyCount: 2,
          createdBy: 'tester'
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when package does not exist', async () => {
      mockDataSource.loadDataset.mockResolvedValueOnce({
        packages: [],
        snapshots: []
      });

      await expect(
        service.generateCopies({
          packageId: 'NON-EXISTENT',
          channel: 'wechat_group',
          copyCount: 2,
          createdBy: 'tester'
        })
      ).rejects.toThrow(NotFoundException);
    });

    it('generates template copies and persists them', async () => {
      const result = await service.generateCopies({
        packageId: 'PKG-COPY-001',
        channel: 'wechat_group',
        scenario: '测试场景',
        tone: '测试口吻',
        copyCount: 2,
        createdBy: 'tester'
      });

      expect(result).toHaveProperty('contentList');
      expect(Array.isArray(result.contentList)).toBe(true);
      expect(result.contentList.length).toBe(2);
      // Template copies should be persisted
      expect(mockPrisma.generatedCopy.createMany).toHaveBeenCalledTimes(1);
      // Package should be upserted
      expect(mockPrisma.contentPackage.upsert).toHaveBeenCalledTimes(1);
    });

    it('defaults scenario and tone when not provided', async () => {
      const result = await service.generateCopies({
        packageId: 'PKG-COPY-001',
        channel: 'wechat_group',
        copyCount: 1,
        createdBy: 'tester'
      });

      expect(result.contentList.length).toBe(1);
      expect(result.contentList[0].scenario).toBe('日常运营推荐');
    });

    it('uses AI copy service when useAI is true', async () => {
      const mockAICopies = [
        {
          contentId: 'AI-COPY-1',
          packageId: 'PKG-COPY-001',
          areaId: 'A001',
          merchantId: 'M001',
          channel: 'wechat_group',
          scenario: 'AI推荐',
          title: 'AI标题',
          body: 'AI内容',
          cta: '点击购买',
          copyVersion: 'A',
          strategyType: 'sprint',
          riskLevel: 'low',
          riskTips: [],
          auditStatus: 'pending',
          auditRemark: null,
          createdBy: 'ai'
        }
      ];
      mockAICopyService.generateCopies.mockResolvedValueOnce(mockAICopies);

      const result = await service.generateCopies({
        packageId: 'PKG-COPY-001',
        channel: 'wechat_group',
        copyCount: 1,
        useAI: true,
        createdBy: 'tester'
      });

      expect(result.contentList).toHaveLength(1);
      expect(mockAICopyService.generateCopies).toHaveBeenCalledTimes(1);
    });
  });

  // ---- listCopies ----

  describe('listCopies', () => {
    it('returns mapped copies from prisma', async () => {
      const dbRows = [
        {
          contentId: 'C1',
          packageId: 'PKG-COPY-001',
          areaId: 'A001',
          merchantId: 'M001',
          channel: 'wechat_group',
          scenario: '日常推荐',
          title: '标题',
          body: '内容',
          cta: '购买',
          copyVersion: 'A',
          strategyType: 'sprint',
          riskLevel: 'low',
          riskTips: '',
          auditStatus: 'pending',
          auditRemark: null,
          createdBy: 'tester',
          createdAt: new Date('2026-06-09'),
          updatedAt: new Date('2026-06-09')
        }
      ];
      mockPrisma.generatedCopy.findMany.mockResolvedValueOnce(dbRows);

      const result = await service.listCopies({});

      expect(result.items).toHaveLength(1);
      expect(result.items[0].contentId).toBe('C1');
      expect(result.items[0].channel).toBe('wechat_group');
    });

    it('passes auditStatus and channel filters to prisma', async () => {
      await service.listCopies({ auditStatus: 'approved', channel: 'moments' }, 1, 20);

      expect(mockPrisma.generatedCopy.findMany).toHaveBeenCalledWith({
        where: { auditStatus: 'approved', channel: 'moments' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20
      });
    });
  });

  // ---- auditCopy ----

  describe('auditCopy', () => {
    it('throws NotFoundException when copy does not exist', async () => {
      mockPrisma.generatedCopy.findUnique.mockResolvedValueOnce(null);

      await expect(service.auditCopy('NON-EXISTENT', { auditStatus: 'approved' })).rejects.toThrow(
        NotFoundException
      );
    });

    it('throws NotFoundException when associated package does not exist in DB', async () => {
      mockPrisma.generatedCopy.findUnique.mockResolvedValueOnce({
        contentId: 'C1',
        packageId: 'PKG-COPY-001',
        title: '标题',
        body: '内容',
        strategyType: 'sprint'
      });
      mockPrisma.contentPackage.findUnique.mockResolvedValueOnce(null);

      await expect(service.auditCopy('C1', { auditStatus: 'approved' })).rejects.toThrow(
        NotFoundException
      );
    });

    it('updates copy with audit status and returns mapped result', async () => {
      mockPrisma.generatedCopy.findUnique.mockResolvedValueOnce({
        contentId: 'C1',
        packageId: 'PKG-COPY-001',
        title: '原标题',
        body: '原内容',
        strategyType: 'sprint'
      });
      mockPrisma.contentPackage.findUnique.mockResolvedValueOnce({
        packageId: 'PKG-COPY-001',
        packageName: '文案测试套餐',
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
        startTime: new Date('2026-05-20'),
        endTime: new Date('2026-06-20'),
        useRules: '需提前预约',
        sellingPoints: '双人可用',
        saleStatus: 'selling',
        fallbackPackageId: null,
        miniProgramPath: '/pages/detail',
        detailSummary: null,
        merchantCooperationScore: 85,
        areaMatchScore: 80,
        timeMatchScore: 78,
        historyScore: 75
      });
      mockPrisma.generatedCopy.update.mockResolvedValueOnce({
        contentId: 'C1',
        packageId: 'PKG-COPY-001',
        areaId: 'A001',
        merchantId: 'M001',
        channel: 'wechat_group',
        scenario: '日常推荐',
        title: '修改后标题',
        body: '修改后内容',
        cta: '购买',
        copyVersion: 'A',
        strategyType: 'sprint',
        riskLevel: 'low',
        riskTips: '',
        auditStatus: 'approved',
        auditRemark: '通过',
        createdBy: 'tester',
        createdAt: new Date('2026-06-09'),
        updatedAt: new Date('2026-06-10')
      });

      const result = await service.auditCopy('C1', {
        auditStatus: 'approved',
        title: '修改后标题',
        body: '修改后内容',
        auditRemark: '通过'
      });

      expect(result.contentId).toBe('C1');
      expect(result.auditStatus).toBe('approved');
      expect(mockPrisma.generatedCopy.update).toHaveBeenCalledTimes(1);
    });

    it('overrides approved to risk when machine audit detects high risk', async () => {
      mockPrisma.generatedCopy.findUnique.mockResolvedValueOnce({
        contentId: 'C2',
        packageId: 'PKG-COPY-001',
        title: '全网最低福利',
        body: '全网最低价格，只要9.9',
        strategyType: 'sprint'
      });
      mockPrisma.contentPackage.findUnique.mockResolvedValueOnce({
        packageId: 'PKG-COPY-001',
        packageName: '文案测试套餐',
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
        startTime: new Date('2026-05-20'),
        endTime: new Date('2026-06-20'),
        useRules: '需提前预约',
        sellingPoints: '双人可用',
        saleStatus: 'selling',
        fallbackPackageId: null,
        miniProgramPath: '/pages/detail',
        detailSummary: null,
        merchantCooperationScore: 85,
        areaMatchScore: 80,
        timeMatchScore: 78,
        historyScore: 75
      });
      mockPrisma.generatedCopy.update.mockImplementationOnce(
        async ({ data }: { where: unknown; data: Prisma.GeneratedCopyUpdateInput }) => ({
          contentId: 'C2',
          packageId: 'PKG-COPY-001',
          areaId: 'A001',
          merchantId: 'M001',
          channel: 'wechat_group',
          scenario: '日常推荐',
          title: data.title,
          body: data.body,
          cta: '购买',
          copyVersion: 'A',
          strategyType: 'sprint',
          riskLevel: data.riskLevel,
          riskTips: data.riskTips,
          auditStatus: data.auditStatus,
          auditRemark: data.auditRemark,
          createdBy: 'tester',
          createdAt: new Date('2026-06-09'),
          updatedAt: new Date('2026-06-10')
        })
      );

      const result = await service.auditCopy('C2', { auditStatus: 'approved' });

      // Because the title contains '全网最低' (forbidden word), machine audit
      // should flag it as high risk and override approved -> risk
      expect(result.auditStatus).toBe('risk');
      expect(result.riskLevel).toBe('high');
    });
  });
});
