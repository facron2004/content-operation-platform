import { Test } from '@nestjs/testing';
import type { ContentPackage, SalesSnapshot } from '@content/shared';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { DataSourceService } from '../src/content/data-source.service';
import { PrismaService } from '../src/prisma/prisma.service';

const packageBase: ContentPackage = {
  packageId: 'LIVE-PKG-001',
  packageName: 'JeeSite实时库存套餐',
  packageType: 'commission',
  merchantId: 'LIVE-MERCHANT',
  merchantName: '实时库存门店',
  areaId: '深圳市',
  areaName: '深圳市',
  category: '餐饮',
  originalPrice: 100,
  salePrice: 59.9,
  welfarePrice: null,
  temporarySalePrice: null,
  commissionRate: 0.12,
  grossProfit: 7.19,
  stockTotal: 100,
  stockLeft: 20,
  startTime: '2026-05-20T00:00:00.000Z',
  endTime: '2026-06-20T00:00:00.000Z',
  useRules: ['到店可用'],
  sellingPoints: ['JeeSite库存字段直出'],
  fallbackPackageId: null,
  miniProgramPath: 'https://zdm.zhsh1.cn/a/bargain/bargainCommodity/form?id=LIVE-PKG-001',
  detailSummary: '',
  saleStatus: 'selling',
  merchantCooperationScore: 86,
  areaMatchScore: 82,
  timeMatchScore: 80,
  historyScore: 78
};

const snapshot = (date: string, remainingStock: number, pkg = packageBase): SalesSnapshot => ({
  packageId: pkg.packageId,
  areaId: pkg.areaId,
  merchantId: pkg.merchantId,
  snapshotTime: `${date}T10:00:00.000Z`,
  exposureCount: 1000,
  clickCount: 120,
  orderCount: pkg.stockTotal - remainingStock,
  paidOrderCount: pkg.stockTotal - remainingStock,
  refundCount: 0,
  verifyCount: 20,
  gmv: 1000,
  paidAmount: 1000,
  refundAmount: 0,
  conversionRate: 0.2,
  verifyRate: 0.2,
  refundRate: 0,
  sellThroughRate: (pkg.stockTotal - remainingStock) / pkg.stockTotal,
  remainingStock,
  salesSpeed: 5
});

const createApp = async (dataset: { packages: ContentPackage[]; snapshots: SalesSnapshot[] }) => {
  const dataSourceMock = { loadDataset: vi.fn().mockResolvedValue(dataset) };

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule]
  })
    .overrideProvider(DataSourceService)
    .useValue(dataSourceMock)
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, dataSourceMock };
};

describe('content inventory API', () => {
  it('uses only JeeSite dataset snapshots to mark slow-moving inventory', async () => {
    const { app } = await createApp({
      packages: [packageBase],
      snapshots: [
        snapshot('2026-05-22', 80),
        snapshot('2026-05-23', 50),
        snapshot('2026-05-24', 20)
      ]
    });

    const response = await request(app.getHttpServer())
      .get(
        '/api/content/packages/recommend?role=platform_operator&status=selling&inventoryFlag=unsold&date=2026-05-24'
      )
      .expect(200);

    expect(response.body.packages).toHaveLength(1);
    expect(response.body.packages[0]).toMatchObject({
      packageId: 'LIVE-PKG-001',
      stockLeft: 20,
      inventoryFlag: 'unsold_3d_slow',
      inventorySalesFlag: 'slow_never_sold_out',
      inventorySalesLabel: '连续未售罄·滞销',
      inventorySalesLevel: 'danger',
      inventoryObservedDays: 3
    });
    expect(
      response.body.packages[0].inventoryTrend.map(
        (point: { remainingStock: number }) => point.remainingStock
      )
    ).toEqual([80, 50, 20]);

    await app.close();
  });

  it('marks a product as hot-selling when recent JeeSite inventory is all zero', async () => {
    const hotPackage = { ...packageBase, stockLeft: 0 };
    const { app } = await createApp({
      packages: [hotPackage],
      snapshots: [snapshot('2026-05-22', 0), snapshot('2026-05-23', 0), snapshot('2026-05-24', 0)]
    });

    const response = await request(app.getHttpServer())
      .get('/api/content/packages/recommend?role=platform_operator&status=selling&date=2026-05-24')
      .expect(200);

    expect(response.body.packages).toHaveLength(1);
    expect(response.body.packages[0]).toMatchObject({
      packageId: 'LIVE-PKG-001',
      stockLeft: 0,
      inventoryFlag: 'normal',
      inventorySalesFlag: 'hot_sold_out_recent',
      inventorySalesLabel: '连续售罄·热销',
      inventorySalesLevel: 'success',
      inventorySoldOutDays: 3
    });

    await app.close();
  });

  it('returns JeeSite-only inventory trend and sales flag in package analysis', async () => {
    const { app } = await createApp({
      packages: [packageBase],
      snapshots: [
        snapshot('2026-05-22', 80),
        snapshot('2026-05-23', 50),
        snapshot('2026-05-24', 20)
      ]
    });

    const response = await request(app.getHttpServer())
      .get('/api/content/packages/LIVE-PKG-001/analysis')
      .expect(200);

    expect(response.body).toMatchObject({
      inventorySalesFlag: 'slow_never_sold_out',
      inventorySalesLabel: '连续未售罄·滞销',
      inventorySalesLevel: 'danger'
    });
    expect(
      response.body.inventoryTrend.map((point: { remainingStock: number }) => point.remainingStock)
    ).toEqual([80, 50, 20]);

    await app.close();
  });

  it('crawls daily remaining inventory from JeeSite dataset fields', async () => {
    const { app } = await createApp({
      packages: [packageBase, { ...packageBase, packageId: 'LIVE-PKG-002', stockLeft: 0 }],
      snapshots: [
        snapshot('2026-05-24', 20),
        { ...snapshot('2026-05-24', 0), packageId: 'LIVE-PKG-002', remainingStock: 0 }
      ]
    });

    const response = await request(app.getHttpServer())
      .post('/api/content/inventory/daily-crawl?date=2026-05-24')
      .expect(201);

    expect(response.body).toMatchObject({
      date: '2026-05-24',
      crawledCount: 2,
      soldOutCount: 1,
      source: 'jeesite.bargainCommodityDynamic.hasInventory'
    });

    await app.close();
  });

  it('paginates operation alerts and batch-resolves visible alert ids', async () => {
    const alertPackage = {
      ...packageBase,
      packageId: 'LIVE-PKG-ALERTS',
      packageName: 'JeeSite alerts package'
    };
    const { app } = await createApp({
      packages: [alertPackage],
      snapshots: [
        snapshot('2026-05-22', 80, alertPackage),
        snapshot('2026-05-23', 50, alertPackage),
        snapshot('2026-05-24', 20, alertPackage)
      ]
    });

    try {
      const response = await request(app.getHttpServer())
        .get('/api/content/alerts?role=platform_operator&type=continuous_unsold&page=1&pageSize=1')
        .expect(200);

      expect(response.body.items).toHaveLength(1);
      expect(response.body.pagination).toMatchObject({
        page: 1,
        pageSize: 1,
        total: 1,
        totalPages: 1
      });
      expect(response.body.topPackages[0].alertIds).toContain('LIVE-PKG-ALERTS:continuous_unsold');

      await request(app.getHttpServer())
        .post('/api/content/alerts/resolve-batch')
        .send({
          alertIds: ['LIVE-PKG-ALERTS:continuous_unsold'],
          resolvedBy: 'vitest-alerts'
        })
        .expect(201);

      const afterResolve = await request(app.getHttpServer())
        .get('/api/content/alerts?role=platform_operator&type=continuous_unsold&page=1&pageSize=1')
        .expect(200);

      expect(afterResolve.body.items).toHaveLength(0);
      expect(afterResolve.body.pagination.total).toBe(0);
    } finally {
      await app
        .get(PrismaService)
        .$executeRawUnsafe(
          'DELETE FROM "OperationAlertResolution" WHERE "alertId" = ? AND "resolvedBy" = ?',
          'LIVE-PKG-ALERTS:continuous_unsold',
          'vitest-alerts'
        )
        .catch(() => undefined);
      await app.close();
    }
  });
});
