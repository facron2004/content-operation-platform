import { Test } from '@nestjs/testing';
import type { ContentPackage, SalesSnapshot } from '@content/shared';
import { describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { DataSourceService } from '../src/content/data-source.service';
import { authedAgent } from './helpers/auth';

const livePackage: ContentPackage = {
  packageId: 'LIVE-PKG-API',
  packageName: 'JeeSite实时套餐',
  packageType: 'commission',
  merchantId: 'LIVE-MERCHANT',
  merchantName: '实时门店',
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
  sellingPoints: ['JeeSite字段直出'],
  fallbackPackageId: null,
  miniProgramPath: 'https://zdm.zhsh1.cn/a/bargain/bargainCommodity/form?id=LIVE-PKG-API',
  detailSummary: '',
  saleStatus: 'selling',
  merchantCooperationScore: 86,
  areaMatchScore: 82,
  timeMatchScore: 80,
  historyScore: 78
};

const liveSnapshot: SalesSnapshot = {
  packageId: livePackage.packageId,
  areaId: livePackage.areaId,
  merchantId: livePackage.merchantId,
  snapshotTime: '2026-05-24T10:00:00.000Z',
  exposureCount: 1000,
  clickCount: 120,
  orderCount: 80,
  paidOrderCount: 80,
  refundCount: 0,
  verifyCount: 20,
  gmv: 1000,
  paidAmount: 1000,
  refundAmount: 0,
  conversionRate: 0.2,
  verifyRate: 0.2,
  refundRate: 0,
  sellThroughRate: 0.8,
  remainingStock: 20,
  salesSpeed: 5
};

describe('content API', () => {
  it('returns JeeSite-backed recommendations and creates auditable copies', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(DataSourceService)
      .useValue({
        loadDataset: vi
          .fn()
          .mockResolvedValue({ packages: [livePackage], snapshots: [liveSnapshot] })
      })
      .compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    const api = await authedAgent(app);
    const recommendations = await api
      .get('/api/content/packages/recommend?role=platform_operator')
      .expect(200);

    expect(recommendations.body.packages.length).toBeGreaterThan(0);
    const first = recommendations.body.packages[0];
    expect(first).toHaveProperty('inventoryBacklogDays');
    expect(first).toHaveProperty('inventoryPriority');
    expect(first).toHaveProperty('inventorySalesFlag');

    const generated = await api
      .post('/api/content/generate')
      .send({
        packageId: first.packageId,
        channel: 'wechat_group',
        tone: '真实群主口吻',
        copyCount: 2,
        createdBy: 'api-test'
      })
      .expect(201);

    expect(generated.body.contentList).toHaveLength(2);
    expect(generated.body.contentList[0].scenario).toBe('日常运营推荐');
    expect(generated.body.contentList[0].auditStatus).toBe('pending');

    const contentId = generated.body.contentList[0].contentId;
    await api
      .post(`/api/content/copies/${contentId}/audit`)
      .send({ auditStatus: 'approved', auditRemark: '通过' })
      .expect(201);

    const copies = await api.get('/api/content/copies?auditStatus=approved').expect(200);

    expect(
      copies.body.items.some((copy: { contentId: string }) => copy.contentId === contentId)
    ).toBe(true);

    await app.close();
  });
});
