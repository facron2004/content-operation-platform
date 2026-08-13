import type { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { authedAgent } from './helpers/auth';

const TARGET_DATE = '2026-08-01';
const RATE_TARGET_DATE = '2099-01-02';
const INCLUDED_ORDER_ID = 'PAID-TIME-HTTP-INCLUDED';
const EXCLUDED_ORDER_ID = 'PAID-TIME-HTTP-EXCLUDED';
const RATE_ORDER_IDS = [
  'RATE-PRECISION-HTTP-REFUNDED',
  'RATE-PRECISION-HTTP-VERIFIED',
  'RATE-PRECISION-HTTP-PENDING'
] as const;
const ORDER_IDS = [INCLUDED_ORDER_ID, EXCLUDED_ORDER_ID, ...RATE_ORDER_IDS];

describe('paidTime HTTP integration contract', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let api: Awaited<ReturnType<typeof authedAgent>>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.orderHeader.deleteMany({ where: { orderId: { in: ORDER_IDS } } });
    await prisma.orderHeader.createMany({
      data: [
        {
          orderId: INCLUDED_ORDER_ID,
          merchantId: 'PAID-TIME-HTTP-MERCHANT-INCLUDED',
          merchantName: '支付窗口内商家',
          areaId: 'paid-time-area',
          areaName: '支付时间区域',
          orderTime: new Date('2026-08-01T01:00:00.000Z'),
          paidTime: new Date('2026-08-01T01:00:00.000Z'),
          // Refund occurs outside the selected paidTime window.
          refundTime: new Date('2026-08-10T01:00:00.000Z'),
          orderAmountFen: 5000n,
          paidAmountFen: 5000n,
          paidAmountWalletFen: 0n,
          paidAmountBonusFen: 0n,
          paidAmountCardFen: 0n,
          refundAmountFen: 1000n,
          verifyAmountFen: 0n,
          status: 'refunded',
          channel: 'wechat_group'
        },
        {
          orderId: EXCLUDED_ORDER_ID,
          merchantId: 'PAID-TIME-HTTP-MERCHANT-EXCLUDED',
          merchantName: '退款窗口内但支付窗口外商家',
          areaId: 'refund-time-area',
          areaName: '退款时间区域',
          orderTime: new Date('2026-07-31T15:00:00.000Z'),
          // Beijing 2026-07-31 23:00 — outside TARGET_DATE.
          paidTime: new Date('2026-07-31T15:00:00.000Z'),
          // Refund occurs inside TARGET_DATE and must not pull the order in.
          refundTime: new Date('2026-08-01T02:00:00.000Z'),
          orderAmountFen: 9000n,
          paidAmountFen: 9000n,
          paidAmountWalletFen: 0n,
          paidAmountBonusFen: 0n,
          paidAmountCardFen: 0n,
          refundAmountFen: 9000n,
          verifyAmountFen: 0n,
          status: 'refunded',
          channel: 'wechat_group'
        },
        {
          orderId: RATE_ORDER_IDS[0],
          merchantId: 'RATE-PRECISION-MERCHANT',
          merchantName: '比率精度商家',
          orderTime: new Date('2099-01-02T01:00:00.000Z'),
          paidTime: new Date('2099-01-02T01:00:00.000Z'),
          refundTime: new Date('2099-01-03T01:00:00.000Z'),
          orderAmountFen: 1000n,
          paidAmountFen: 1000n,
          paidAmountWalletFen: 0n,
          paidAmountBonusFen: 0n,
          paidAmountCardFen: 0n,
          refundAmountFen: 100n,
          verifyAmountFen: 0n,
          status: 'refunded',
          channel: 'wechat_group'
        },
        {
          orderId: RATE_ORDER_IDS[1],
          merchantId: 'RATE-PRECISION-MERCHANT',
          merchantName: '比率精度商家',
          orderTime: new Date('2099-01-02T01:01:00.000Z'),
          paidTime: new Date('2099-01-02T01:01:00.000Z'),
          orderAmountFen: 1000n,
          paidAmountFen: 1000n,
          paidAmountWalletFen: 0n,
          paidAmountBonusFen: 0n,
          paidAmountCardFen: 0n,
          refundAmountFen: 0n,
          verifyAmountFen: 1000n,
          verifyTime: new Date('2099-01-02T02:00:00.000Z'),
          status: 'verified',
          channel: 'wechat_group'
        },
        {
          orderId: RATE_ORDER_IDS[2],
          merchantId: 'RATE-PRECISION-MERCHANT',
          merchantName: '比率精度商家',
          orderTime: new Date('2099-01-02T01:02:00.000Z'),
          paidTime: new Date('2099-01-02T01:02:00.000Z'),
          orderAmountFen: 1000n,
          paidAmountFen: 1000n,
          paidAmountWalletFen: 0n,
          paidAmountBonusFen: 0n,
          paidAmountCardFen: 0n,
          refundAmountFen: 0n,
          verifyAmountFen: 0n,
          status: 'paid',
          channel: 'wechat_group'
        }
      ]
    });

    api = await authedAgent(app);
  });

  afterAll(async () => {
    await prisma.orderHeader.deleteMany({ where: { orderId: { in: ORDER_IDS } } });
    await app.close();
  });

  it('keeps data-analysis summary attribution on paidTime', async () => {
    const response = await api
      .get(`/api/data-analysis/summary?window=day&date=${TARGET_DATE}&endDate=${TARGET_DATE}`)
      .expect(200);

    expect(response.body.overview).toMatchObject({
      orderCount: 1,
      salesAmount: 50,
      tradeAmount: 50,
      refundAmount: 10,
      netGmv: 40,
      avgOrderValue: 40,
      refundCount: 1,
      refundRate: 1,
      pendingVerifyCount: 0
    });
    expect(response.body.daily).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: TARGET_DATE,
          orderCount: 1,
          refundAmount: 10,
          netGmv: 40
        })
      ])
    );
    expect(response.body.merchants).toEqual([
      expect.objectContaining({
        name: '支付窗口内商家',
        salesAmount: 50,
        refundAmount: 10,
        avgOrderValue: 40
      })
    ]);
  });

  it('keeps refund KPI and merchant ranking attribution on paidTime', async () => {
    const response = await api.get(`/api/refund/today?window=day&date=${TARGET_DATE}`).expect(200);

    expect(response.body).toMatchObject({
      date: TARGET_DATE,
      totalRefund: 10,
      totalGmv: 40,
      refundCount: 1,
      paidOrderCount: 1,
      refundRate: 1
    });
    expect(response.body.topRefundMerchants).toEqual([
      expect.objectContaining({
        merchantId: 'PAID-TIME-HTTP-MERCHANT-INCLUDED',
        refund: 10,
        gmv: 40
      })
    ]);
  });

  it('keeps 1/3 refund and verify rates identical across analytics APIs', async () => {
    const analysis = await api
      .get(
        `/api/data-analysis/summary?window=day&date=${RATE_TARGET_DATE}&endDate=${RATE_TARGET_DATE}`
      )
      .expect(200);
    const gmv = await api.get(`/api/gmv/today?date=${RATE_TARGET_DATE}`).expect(200);
    const refund = await api
      .get(`/api/refund/today?window=day&date=${RATE_TARGET_DATE}`)
      .expect(200);
    const verify = await api
      .get(`/api/verify/today?window=day&date=${RATE_TARGET_DATE}`)
      .expect(200);

    expect(analysis.body.overview).toMatchObject({
      orderCount: 3,
      refundCount: 1,
      verifiedCount: 1,
      refundRate: 0.3333,
      verifyRate: 0.3333
    });
    expect(analysis.body.timeSlots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ orderCount: 3, verifiedCount: 1, verifyRate: 0.3333 })
      ])
    );
    expect(analysis.body.merchants).toEqual([
      expect.objectContaining({ orderCount: 3, verifiedCount: 1, verifyRate: 0.3333 })
    ]);
    expect(gmv.body).toMatchObject({
      paidOrderCount: 3,
      refundOrderCount: 1,
      verifyOrderCount: 1,
      refundRate: analysis.body.overview.refundRate,
      verifyRate: analysis.body.overview.verifyRate
    });
    expect(refund.body).toMatchObject({
      paidOrderCount: 3,
      refundCount: 1,
      refundRate: analysis.body.overview.refundRate
    });
    expect(verify.body).toMatchObject({
      paidOrderCount: 3,
      verifyCount: 1,
      verifyRate: analysis.body.overview.verifyRate
    });
  });

  it('keeps refund trend, ranking, and Excel detail attribution on paidTime', async () => {
    const trend = await api.get(`/api/refund/trend?days=7&endDate=${TARGET_DATE}`).expect(200);
    expect(trend.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: TARGET_DATE,
          totalRefund: 10,
          refundCount: 1,
          paidOrderCount: 1
        })
      ])
    );

    const ranking = await api
      .get(
        `/api/refund/top-merchants?window=day&date=${TARGET_DATE}&sortBy=refundDesc&page=1&pageSize=20`
      )
      .expect(200);
    expect(ranking.body).toMatchObject({ hasMore: false, truncated: false });
    expect(ranking.body.items).toEqual([
      expect.objectContaining({
        merchantId: 'PAID-TIME-HTTP-MERCHANT-INCLUDED',
        refund: 10,
        gmv: 40
      })
    ]);

    const exported = await api
      .get(`/api/data-analysis/export?window=day&date=${TARGET_DATE}&endDate=${TARGET_DATE}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(exported.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exported.body.buffer as ArrayBuffer);
    const detailSheet = workbook.getWorksheet('订单明细');
    expect(detailSheet?.getRow(2).getCell(2).value).toBe(INCLUDED_ORDER_ID);
    expect(detailSheet?.getRow(3).getCell(2).value).toBeNull();
  });
});
