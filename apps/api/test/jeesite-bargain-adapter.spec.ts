import { describe, expect, it } from 'vitest';
import {
  mapJeesiteBargainListToDataset,
  mapJeesiteOrderListToDataset
} from '../src/content/jeesite-bargain-adapter';

describe('mapJeesiteOrderListToDataset', () => {
  it('maps paid and verified order fields used by the GMV ETL', () => {
    const { orders } = mapJeesiteOrderListToDataset({
      list: [
        {
          id: 'order-1',
          orderCode: 'K202607150001',
          centerMemberId: 'member-1',
          bargainCommodityId: 'package-1',
          corePartnerId: 'merchant-1',
          corePartner: { name: 'Merchant One' },
          createDate: '2026-07-15 10:00:00',
          updateDate: '2026-07-15 11:00:00',
          payPrice: 80,
          deductionBalance: 20,
          balanceIntegral: 500,
          totalPrice: 105,
          orderStatus: 30,
          salesUserName: '詹昌立',
          parentSalesUserName: '李健华',
          couponName: '满80-10元券'
        }
      ]
    });

    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      orderId: 'order-1',
      orderCode: 'K202607150001',
      memberId: 'member-1',
      packageId: 'package-1',
      merchantId: 'merchant-1',
      merchantName: 'Merchant One',
      salesman: '詹昌立',
      parentSalesman: '李健华',
      coupon: '满80-10元券',
      paidAmount: 80,
      paidAmountWallet: 20,
      paidAmountBonus: 5,
      verifyAmount: 100,
      status: 'verified'
    });
  });

  it('maps bargainOrder/listData businessUserName as salesman, not merchant', () => {
    // 线上 listData 实测：业务员=businessUserName，商家=corePartner.name，
    // 优惠券=centerMemberTicketTitle，上级=businessUserParentName。
    const { orders } = mapJeesiteOrderListToDataset({
      list: [
        {
          id: 'order-biz',
          orderCode: 'K20260723162824494656',
          businessUserName: '莫文怡',
          businessUserParentName: '李健华',
          centerMemberTicketTitle: 'ZH五折券-新',
          corePartner: { name: '深圳市秦喜肉夹馍餐饮管理有限责任公司' },
          corePartnerId: '2038866201350164480',
          payPrice: 18.14,
          orderStatus: 20,
          createDate: '2026-07-23 16:28:00',
          payDate: '2026-07-23 16:28:24',
          bargainCommoditySys: {
            businessUserName: '莫文怡',
            businessParentUserName: '李健华'
          }
        }
      ]
    });
    expect(orders[0]).toMatchObject({
      orderId: 'order-biz',
      orderCode: 'K20260723162824494656',
      merchantName: '深圳市秦喜肉夹馍餐饮管理有限责任公司',
      merchantId: '2038866201350164480',
      salesman: '莫文怡',
      parentSalesman: '李健华',
      coupon: 'ZH五折券-新'
    });
  });

  it('does not fall businessUserName back to merchantName when corePartner missing', () => {
    // 无 corePartner 时商家应空，业务员仍取 businessUserName。
    const { orders } = mapJeesiteOrderListToDataset({
      list: [
        {
          id: 'order-no-partner',
          businessUserName: '詹昌立',
          payPrice: 10,
          orderStatus: 20,
          createDate: '2026-07-15 10:00:00'
        }
      ]
    });
    expect(orders[0].merchantName).toBe('');
    expect(orders[0].salesman).toBe('詹昌立');
  });

  it('keeps completed (40) and post-pay refund (-20) as paid-side orders with paidTime', () => {
    const { orders } = mapJeesiteOrderListToDataset({
      list: [
        {
          id: 'order-40',
          centerMemberId: 'm-40',
          bargainCommodityId: 'p-40',
          corePartnerId: 'merchant-40',
          corePartner: { name: 'Done Shop' },
          createDate: '2026-07-18 15:22',
          updateDate: '2026-07-18 22:34',
          payDate: '2026-07-18 15:22:15',
          verificationTime: '2026-07-18 15:35:00',
          payPrice: 68,
          deductionBalance: 0,
          totalPrice: 93.1,
          orderStatus: 40,
          isEvaluate: 1
        },
        {
          id: 'order-neg20',
          centerMemberId: 'm-neg20',
          bargainCommodityId: 'p-neg20',
          corePartnerId: 'merchant-neg20',
          corePartner: { name: 'Refund Shop' },
          createDate: '2026-07-18 20:24',
          updateDate: '2026-07-18 22:30',
          payDate: '2026-07-18 20:24:42',
          payPrice: 9.5,
          deductionBalance: 0,
          refundPrice: 9.5,
          totalPrice: 9.5,
          orderStatus: -20
        },
        {
          id: 'order-open',
          centerMemberId: 'm-open',
          bargainCommodityId: 'p-open',
          corePartnerId: 'merchant-open',
          createDate: '2026-07-18 12:00',
          payPrice: 10,
          orderStatus: 10
        }
      ]
    });

    expect(orders).toHaveLength(3);

    const completed = orders.find((o) => o.orderId === 'order-40')!;
    expect(completed.status).toBe('verified');
    expect(completed.paidTime).toBe('2026-07-18T07:22:15.000Z');
    expect(completed.verifyTime).toBe('2026-07-18T07:35:00.000Z');
    expect(completed.verifyAmount).toBe(68);
    expect(completed.refundAmount).toBe(0);

    const refunded = orders.find((o) => o.orderId === 'order-neg20')!;
    expect(refunded.status).toBe('refunded');
    expect(refunded.paidTime).toBe('2026-07-18T12:24:42.000Z');
    expect(refunded.refundAmount).toBe(9.5);
    expect(refunded.refundTime).toBe('2026-07-18T14:30:00.000Z');

    const open = orders.find((o) => o.orderId === 'order-open')!;
    expect(open.status).toBe('cancelled');
    expect(open.paidTime).toBeNull();
  });
});

describe('JeeSite bargain backend adapter', () => {
  it('maps bargainCommodity listData rows into packages and sales snapshots', () => {
    const dataset = mapJeesiteBargainListToDataset(
      {
        count: 1,
        list: [
          {
            id: 'bc-1001',
            commodityName: '双人招牌本帮套餐',
            shopName: '梧桐小馆',
            storeId: 'store-1',
            cityName: '上海',
            districtName: '徐汇',
            categoryName: '江浙菜',
            marketPrice: 226,
            bargainPrice: 158,
            stock: 100,
            surplusStock: 36,
            saleNum: 64,
            visitNum: 1200,
            clickNum: 220,
            payNum: 58,
            refundNum: 3,
            verifyNum: 42,
            bargainState: 10,
            startTime: '2026-05-10 10:00:00',
            endTime: '2026-05-20 23:59:59',
            useRule: '需提前预约；不可与其他优惠同享',
            sellPoint: '本帮招牌菜，双人到店套餐',
            status: '0'
          }
        ]
      },
      { baseUrl: 'https://zdm.zhsh1.cn/a' }
    );

    expect(dataset.packages).toHaveLength(1);
    expect(dataset.snapshots).toHaveLength(1);
    expect(dataset.packages[0]).toMatchObject({
      packageId: 'bc-1001',
      packageName: '双人招牌本帮套餐',
      packageType: 'commission',
      merchantId: 'store-1',
      merchantName: '梧桐小馆',
      areaId: '徐汇',
      areaName: '上海徐汇',
      category: '江浙菜',
      originalPrice: 226,
      salePrice: 158,
      stockTotal: 100,
      stockLeft: 36,
      useRules: ['需提前预约', '不可与其他优惠同享'],
      sellingPoints: ['本帮招牌菜', '双人到店套餐'],
      miniProgramPath: 'https://zdm.zhsh1.cn/a/bargain/bargainCommodity/form?id=bc-1001'
    });
    expect(dataset.snapshots[0]).toMatchObject({
      packageId: 'bc-1001',
      areaId: '徐汇',
      merchantId: 'store-1',
      exposureCount: 1200,
      clickCount: 220,
      orderCount: 64,
      paidOrderCount: 58,
      refundCount: 3,
      verifyCount: 42,
      remainingStock: 36
    });
    expect(dataset.snapshots[0].conversionRate).toBeCloseTo(64 / 220, 4);
    expect(dataset.snapshots[0].sellThroughRate).toBeCloseTo(0.64, 4);
  });

  it('accepts wrapped table responses and cent-based price fields', () => {
    const dataset = mapJeesiteBargainListToDataset({
      data: {
        rows: [
          {
            commodityId: 'bc-2001',
            title: '下午茶单人券',
            merchantName: '青柠茶铺',
            merchantId: 'm-2',
            areaName: '浦东',
            originalPriceCents: 6800,
            priceCents: 3900,
            bargainState: 10,
            totalStock: 20,
            stockLeft: 0,
            soldCount: 20
          }
        ]
      }
    });

    expect(dataset.packages[0]).toMatchObject({
      packageId: 'bc-2001',
      originalPrice: 68,
      salePrice: 39,
      stockTotal: 20,
      stockLeft: 0
    });
    expect(dataset.snapshots[0].sellThroughRate).toBe(1);
  });

  it('maps live JeeSite bargain commodity field names', () => {
    const dataset = mapJeesiteBargainListToDataset({
      count: 1,
      list: [
        {
          id: '2053422638421618688',
          title: 'Q15 bargain meal',
          marketPrice: 105.8,
          sellingPrice: 78,
          bargainFloorPrice: 50,
          bargainState: 10,
          startDate: '2026-03-31 00:00:00',
          expireDate: '2026-09-30 00:00:00',
          cityName: 'Shenzhen',
          tagText: 'holiday excluded',
          corePartnerId: '2038866201350164480',
          corePartnerShopName: 'Qinxi Store',
          bargainCommodityDynamic: {
            hasHeatCount: 10,
            hasBargainAmount: 17,
            hasInventory: 1,
            inventoryTotal: 169,
            initialInventoryTotal: 182
          },
          bargainCommodityTag: {
            name: 'food'
          }
        }
      ]
    });

    expect(dataset.packages).toHaveLength(1);
    expect(dataset.packages[0]).toMatchObject({
      packageId: '2053422638421618688',
      packageName: 'Q15 bargain meal',
      merchantId: '2038866201350164480',
      merchantName: 'Qinxi Store',
      areaId: 'Shenzhen',
      areaName: 'Shenzhen',
      category: 'food',
      originalPrice: 105.8,
      salePrice: 78,
      temporarySalePrice: 78,
      welfarePrice: 50,
      stockTotal: 182,
      stockLeft: 1,
      useRules: ['holiday excluded']
    });
    expect(dataset.snapshots[0]).toMatchObject({
      exposureCount: 10,
      orderCount: 17,
      paidOrderCount: 17,
      remainingStock: 1
    });
    expect(dataset.snapshots[0].sellThroughRate).toBeCloseTo(181 / 182, 4);
  });

  it('uses fixed price when fixed-price mode is enabled and temporary price otherwise', () => {
    const dataset = mapJeesiteBargainListToDataset({
      list: [
        {
          id: 'fixed-price',
          title: '一口价套餐',
          marketPrice: 100,
          sellingPrice: 88,
          temporaryPrice: 66,
          fixedPrice: 49,
          isFixed: 1,
          bargainState: 10,
          bargainCommodityDynamic: {
            hasInventory: 10,
            initialInventoryTotal: 100
          }
        },
        {
          id: 'temporary-price',
          title: '临时价套餐',
          marketPrice: 100,
          sellingPrice: 88,
          temporaryPrice: 66,
          fixedPrice: 49,
          isFixed: 0,
          bargainState: 10,
          bargainCommodityDynamic: {
            hasInventory: 10,
            initialInventoryTotal: 100
          }
        }
      ]
    });

    expect(
      dataset.packages.map((pkg) => ({
        packageId: pkg.packageId,
        salePrice: pkg.salePrice,
        temporarySalePrice: pkg.temporarySalePrice
      }))
    ).toEqual([
      { packageId: 'fixed-price', salePrice: 49, temporarySalePrice: 49 },
      { packageId: 'temporary-price', salePrice: 66, temporarySalePrice: 66 }
    ]);
  });

  it('keeps only selling JeeSite rows', () => {
    const dataset = mapJeesiteBargainListToDataset({
      list: [
        {
          id: 'selling-row',
          title: '销售中套餐',
          temporaryPrice: 66,
          bargainState: 10,
          bargainCommodityDynamic: { hasInventory: 1, initialInventoryTotal: 10 }
        },
        {
          id: 'pending-row',
          title: '未上架套餐',
          temporaryPrice: 66,
          bargainState: -10,
          bargainCommodityDynamic: { hasInventory: 1, initialInventoryTotal: 10 }
        },
        {
          id: 'recycle-row',
          title: '回收站套餐',
          temporaryPrice: 66,
          bargainState: -20,
          bargainCommodityDynamic: { hasInventory: 1, initialInventoryTotal: 10 }
        }
      ]
    });

    expect(dataset.packages.map((pkg) => pkg.packageId)).toEqual(['selling-row']);
    expect(dataset.snapshots.map((snapshot) => snapshot.packageId)).toEqual(['selling-row']);
  });
});
