import type { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { authedAgent } from './helpers/auth';

const TARGET_DATE = '2026-08-01';
const INCLUDED_ORDER_ID = 'PAID-TIME-HTTP-INCLUDED';
const EXCLUDED_ORDER_ID = 'PAID-TIME-HTTP-EXCLUDED';
const ORDER_IDS = [INCLUDED_ORDER_ID, EXCLUDED_ORDER_ID];

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
      // Data-analysis refundAmount is the refunded paid components, not raw refundAmountFen.
      refundAmount: 50,
      netGmv: 0,
      refundCount: 1,
      refundRate: 1
    });
    expect(response.body.daily).toEqual(
      expect.arrayContaining([expect.objectContaining({ date: TARGET_DATE, orderCount: 1 })])
    );
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
