import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataSourceService } from '../src/content/data-source.service';
import { ContentMerchantSyncService } from '../src/content/content-merchant-sync.service';
import { PrismaService } from '../src/prisma/prisma.service';

const { mockUpsertMerchants } = vi.hoisted(() => ({
  mockUpsertMerchants: vi.fn()
}));

vi.mock('../src/merchant/merchant-address-updater', () => ({
  upsertMerchants: mockUpsertMerchants
}));

const mockDataSource = { loadDataset: vi.fn() };
const mockPrisma = { $executeRawUnsafe: vi.fn() };

const packageFixture = {
  packageId: 'PKG-SYNC-001',
  packageName: '同步测试套餐',
  packageType: 'commission',
  merchantId: 'MERCHANT-SYNC-001',
  merchantName: '同步测试商家',
  areaId: 'AREA-001',
  areaName: '测试区域',
  category: '餐饮',
  originalPrice: 100,
  salePrice: 80,
  welfarePrice: null,
  commissionRate: 0.1,
  grossProfit: 10,
  stockTotal: 10,
  stockLeft: 8,
  currentStock: 7,
  startTime: '2026-08-01T00:00:00.000Z',
  endTime: '2026-08-31T23:59:59.000Z',
  useRules: ['需预约'],
  sellingPoints: ['测试卖点'],
  miniProgramPath: '/pages/detail?id=PKG-SYNC-001',
  detailSummary: '测试详情',
  saleStatus: 'selling',
  merchantCooperationScore: 80,
  shopId: 'SHOP-SYNC-001',
  merchantAddress: '测试地址'
};

describe('ContentMerchantSyncService', () => {
  let service: ContentMerchantSyncService;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockUpsertMerchants.mockResolvedValue({ upserted: 1 });
    mockPrisma.$executeRawUnsafe.mockResolvedValue(1);
    mockDataSource.loadDataset.mockResolvedValue({ packages: [], snapshots: [] });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentMerchantSyncService,
        { provide: DataSourceService, useValue: mockDataSource },
        { provide: PrismaService, useValue: mockPrisma }
      ]
    }).compile();

    service = module.get<ContentMerchantSyncService>(ContentMerchantSyncService);
  });

  it('joins a concurrent sync so the caller waits for the fresh ContentPackage write', async () => {
    let releaseLoad!: (dataset: { packages: never[]; snapshots: never[] }) => void;
    mockDataSource.loadDataset.mockReturnValueOnce(
      new Promise((resolve) => {
        releaseLoad = resolve;
      })
    );

    const first = service.syncMerchantsFromJeeSite();
    const second = service.syncMerchantsFromJeeSite();

    expect(mockDataSource.loadDataset).toHaveBeenCalledTimes(1);

    releaseLoad({ packages: [], snapshots: [] });
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toMatchObject({
      packagesCount: 0,
      packagesPersisted: 0
    });
    expect(secondResult).toEqual(firstResult);
  });

  it('upserts merchant data and persists eligible packages in one batch', async () => {
    const dataset = { packages: [packageFixture], snapshots: [], isComplete: true };
    mockDataSource.loadDataset.mockResolvedValueOnce(dataset);

    const result = await service.syncMerchantsFromJeeSite();

    expect(mockUpsertMerchants).toHaveBeenCalledWith(mockPrisma, dataset);
    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    const [sql] = mockPrisma.$executeRawUnsafe.mock.calls[0] as [string, ...unknown[]];
    expect(sql).toContain('INSERT INTO "ContentPackage"');
    expect(sql).toContain('"startTime"=excluded."startTime"');
    expect(sql).toContain('"endTime"=excluded."endTime"');
    expect(mockPrisma.$executeRawUnsafe.mock.calls[0]).toContain(7);
    const [reconcileSql] = mockPrisma.$executeRawUnsafe.mock.calls[1] as [string, ...unknown[]];
    expect(reconcileSql).toContain('SET "saleStatus"=\'pending\'');
    expect(result).toMatchObject({
      upserted: 1,
      packagesCount: 1,
      packagesPersisted: 1,
      stalePackagesDeactivated: 1
    });
  });

  it('does not reconcile stale selling packages when the external scan is incomplete', async () => {
    const dataset = { packages: [packageFixture], snapshots: [], isComplete: false };
    mockDataSource.loadDataset.mockResolvedValueOnce(dataset);

    const result = await service.syncMerchantsFromJeeSite();

    expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
    expect(result.stalePackagesDeactivated).toBe(0);
  });
});
