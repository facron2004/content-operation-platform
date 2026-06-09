import { describe, expect, it } from 'vitest';
import { mapJeesiteBargainListToDataset } from '../src/content/jeesite-bargain-adapter';

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

    expect(dataset.packages.map((pkg) => ({
      packageId: pkg.packageId,
      salePrice: pkg.salePrice,
      temporarySalePrice: pkg.temporarySalePrice
    }))).toEqual([
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
