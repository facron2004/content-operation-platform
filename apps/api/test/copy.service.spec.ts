import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ContentPackage, GeneratedCopy, SalesSnapshot } from '@content/shared';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CopyService } from '../src/content/copy.service';
import { CopyAuditService } from '../src/content/copy-audit.service';
import { CopyGenerationService } from '../src/content/copy-generation.service';
import { CopyQueryService } from '../src/content/copy-query.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { DataSourceService } from '../src/content/data-source.service';
import { PackageDetailService } from '../src/content/package-detail';
import { AICopyService } from '../src/content/ai-copy';
import { PACKAGE_AUDIT_SELECT, mapPackageForAudit } from '../src/content/mappers';

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
    // Legacy path kept for other suites; residual #104 audit uses $executeRawUnsafe.
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    count: vi.fn().mockResolvedValue(0)
  },
  contentPackage: {
    upsert: vi.fn().mockResolvedValue({}),
    findUnique: vi.fn().mockResolvedValue(null)
  },
  // Residual #104/#168: atomic versionNo MAX+1 audit write via $executeRawUnsafe slim shell.
  $executeRawUnsafe: vi.fn().mockResolvedValue(1),
  $queryRawUnsafe: vi.fn().mockResolvedValue([])
};

const auditPackageRow = {
  originalPriceFen: 10000n,
  salePriceFen: 5000n,
  temporarySalePriceFen: null,
  stockTotal: 100,
  stockLeft: 50,
  useRules: '提前预约'
};

function createPreloadedAuditCopy(contentId: string): GeneratedCopy {
  return {
    contentId,
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
    riskTips: [],
    auditStatus: 'pending',
    auditRemark: null,
    createdBy: 'tester',
    createdAt: '2026-06-09 10:00:00',
    updatedAt: '2026-06-09 10:00:00'
  } as GeneratedCopy;
}

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

describe('machine audit package projection', () => {
  it('keeps only the price, stock, and usage-rule fields at runtime', () => {
    expect(Object.keys(PACKAGE_AUDIT_SELECT)).toEqual([
      'originalPriceFen',
      'salePriceFen',
      'temporarySalePriceFen',
      'stockTotal',
      'stockLeft',
      'useRules'
    ]);

    expect(
      mapPackageForAudit({
        originalPriceFen: 10000n,
        salePriceFen: 6500n,
        temporarySalePriceFen: null,
        stockTotal: 20,
        stockLeft: 7,
        useRules: '提前预约、两人同行'
      })
    ).toEqual({
      originalPrice: 100,
      salePrice: 65,
      temporarySalePrice: null,
      stockTotal: 20,
      stockLeft: 7,
      useRules: ['提前预约', '两人同行']
    });
  });
});

describe('CopyService', () => {
  let service: CopyService;

  it('keeps one detail lookup path for package scope', () => {
    expect('getCopyPackageId' in CopyService.prototype).toBe(false);
  });

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
    mockPrisma.generatedCopy.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.$executeRawUnsafe.mockResolvedValue(1);
    mockPrisma.contentPackage.upsert.mockResolvedValue({});
    mockPrisma.contentPackage.findUnique.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CopyService,
        CopyAuditService,
        CopyGenerationService,
        CopyQueryService,
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

    it('passes auditStatus, channel, and trailing 90d createdAt window to prisma', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-18T12:00:00+08:00'));
      await service.listCopies({ auditStatus: 'approved', channel: 'moments' }, 1, 20);

      const call = mockPrisma.generatedCopy.findMany.mock.calls[0][0];
      expect(call.where.auditStatus).toBe('approved');
      expect(call.where.channel).toBe('moments');
      expect(call.where.createdAt.gte).toEqual(new Date('2026-04-20T00:00:00+08:00'));
      expect(call.where.createdAt.lt).toEqual(new Date('2026-07-19T00:00:00+08:00'));
      expect(call.orderBy).toEqual({ createdAt: 'desc' });
      expect(call.skip).toBe(0);
      expect(call.take).toBe(20);
      vi.useRealTimers();
    });

    it('applies area and merchant filters to GeneratedCopy directly', async () => {
      await service.listCopies({ areaIds: ['A001'], merchantIds: ['M001'] });

      const call = mockPrisma.generatedCopy.findMany.mock.calls[0][0];
      expect(call.where.OR).toEqual([
        { areaId: { in: ['A001'] } },
        { merchantId: { in: ['M001'] } }
      ]);
      expect(call.where.package).toBeUndefined();
    });

    it('returns dateFrom/dateTo on pagination for trailing 90d window', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-18T12:00:00+08:00'));
      mockPrisma.generatedCopy.findMany.mockResolvedValueOnce([]);
      mockPrisma.generatedCopy.count.mockResolvedValueOnce(0);
      const result = await service.listCopies({});
      expect(result.pagination.dateFrom).toBe('2026-04-20');
      expect(result.pagination.dateTo).toBe('2026-07-18');
      vi.useRealTimers();
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

    it('updates copy with audit status and returns slim success shell', async () => {
      mockPrisma.generatedCopy.findUnique.mockResolvedValueOnce({
        contentId: 'C1',
        packageId: 'PKG-COPY-001',
        channel: 'wechat_group',
        title: '原标题',
        body: '原内容',
        strategyType: 'sprint',
        auditStatus: 'pending'
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
      // Residual #168: changed-rows probe via $executeRawUnsafe (no full-row payload).
      mockPrisma.$executeRawUnsafe.mockResolvedValueOnce(1);

      const result = await service.auditCopy('C1', {
        auditStatus: 'approved',
        title: '修改后标题',
        body: '修改后内容',
        auditRemark: '通过'
      });

      expect(result.success).toBe(true);
      expect(result.contentId).toBe('C1');
      expect(result.auditStatus).toBe('approved');
      expect(result.packageId).toBe('PKG-COPY-001');
      expect(result.channel).toBe('wechat_group');
      // Happy-path audit write is $executeRawUnsafe (slim shell).
      // ensureTaskForApprovedCopy may issue additional raw queries for task mint.
      expect(mockPrisma.$executeRawUnsafe.mock.calls.length).toBeGreaterThanOrEqual(1);
      const sql = String(mockPrisma.$executeRawUnsafe.mock.calls[0][0]);
      expect(sql).toMatch(/MAX\(v\."versionNo"\)/);
      expect(sql).toMatch(/auditStatus" IN \('pending', 'draft', 'risk'\)/);
      expect(sql).not.toMatch(/\bRETURNING\b/);
      expect(mockPrisma.generatedCopy.count).not.toHaveBeenCalled();
      // Happy path must not re-read full row after write (only pre-check findUnique).
      expect(mockPrisma.generatedCopy.findUnique).toHaveBeenCalledTimes(1);
    });

    it('uses a preloaded copy without issuing a second full-row lookup', async () => {
      mockPrisma.contentPackage.findUnique.mockResolvedValueOnce({
        originalPriceFen: 10000n,
        salePriceFen: 5000n,
        temporarySalePriceFen: null,
        stockTotal: 100,
        stockLeft: 50,
        useRules: '提前预约'
      });
      mockPrisma.$executeRawUnsafe.mockResolvedValueOnce(1);

      const result = await service.auditCopy(
        'C-preloaded',
        { auditStatus: 'approved', mintDistributionTask: false },
        {
          contentId: 'C-preloaded',
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
          riskTips: [],
          auditStatus: 'pending',
          auditRemark: null,
          createdBy: 'tester',
          createdAt: '2026-06-09 10:00:00',
          updatedAt: '2026-06-09 10:00:00'
        } as GeneratedCopy
      );

      expect(result).toMatchObject({
        success: true,
        contentId: 'C-preloaded',
        auditStatus: 'approved'
      });
      expect(mockPrisma.generatedCopy.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.contentPackage.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { packageId: 'PKG-COPY-001' } })
      );
    });

    it('does not report a task id when promoting waiting_audit fails', async () => {
      mockPrisma.contentPackage.findUnique.mockResolvedValueOnce(auditPackageRow);
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
        { taskId: 'task-existing', status: 'waiting_audit' }
      ]);
      mockPrisma.$executeRawUnsafe
        .mockResolvedValueOnce(1)
        .mockRejectedValueOnce(new Error('database is locked'));

      const result = await service.auditCopy(
        'C-waiting-audit',
        { auditStatus: 'approved' },
        createPreloadedAuditCopy('C-waiting-audit')
      );

      expect(result.success).toBe(true);
      expect(result.distributionTaskId).toBeUndefined();
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    });

    it('does not retry a non-unique task insert failure as a race', async () => {
      mockPrisma.contentPackage.findUnique.mockResolvedValueOnce(auditPackageRow);
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([]);
      mockPrisma.$executeRawUnsafe
        .mockResolvedValueOnce(1)
        .mockRejectedValueOnce(new Error('database is locked'))
        .mockResolvedValue(1);

      const result = await service.auditCopy(
        'C-insert-failure',
        { auditStatus: 'approved' },
        createPreloadedAuditCopy('C-insert-failure')
      );

      expect(result.success).toBe(true);
      expect(result.distributionTaskId).toBeUndefined();
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    });

    it('still re-reads the winner after a unique task insert race', async () => {
      mockPrisma.contentPackage.findUnique.mockResolvedValueOnce(auditPackageRow);
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ taskId: 'task-winner' }]);
      mockPrisma.$executeRawUnsafe
        .mockResolvedValueOnce(1)
        .mockRejectedValueOnce(new Error('UNIQUE constraint failed: DistributionTask.taskId'));

      const result = await service.auditCopy(
        'C-unique-race',
        { auditStatus: 'approved' },
        createPreloadedAuditCopy('C-unique-race')
      );

      expect(result.distributionTaskId).toBe('task-winner');
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(3);
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    });

    it('overrides approved to risk when machine audit detects high risk', async () => {
      mockPrisma.generatedCopy.findUnique.mockResolvedValueOnce({
        contentId: 'C2',
        packageId: 'PKG-COPY-001',
        channel: 'wechat_group',
        title: '全网最低福利',
        body: '全网最低价格，只要9.9',
        strategyType: 'sprint',
        auditStatus: 'pending'
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
      // Residual #168: changed-rows only — slim shell synthesizes auditStatus from finalStatus.
      mockPrisma.$executeRawUnsafe.mockResolvedValueOnce(1);

      const result = await service.auditCopy('C2', { auditStatus: 'approved' });

      // Because the title contains '全网最低' (forbidden word), machine audit
      // should flag it as high risk and override approved -> risk
      expect(result.success).toBe(true);
      expect(result.auditStatus).toBe('risk');
      // Risk level is not part of the slim shell (SPA discards body); assert via write params.
      const writeParams = mockPrisma.$executeRawUnsafe.mock.calls[0].slice(1);
      // Param order: title, body, finalStatus, auditRemark, riskLevel, riskTips, ...
      expect(writeParams[2]).toBe('risk');
      expect(writeParams[4]).toBe('high');
    });
  });
});
