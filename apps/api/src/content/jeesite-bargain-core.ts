import type { ContentPackage } from '@content/shared';
import { clamp, clampNonNegative } from '../domain/utils';
import { rowBoolean, rowMoney, rowNumber, rowText, type AnyRecord } from './jeesite-row-reader';

export interface BargainCoreValues {
  packageId: string;
  packageName: string;
  merchantId: string;
  merchantName: string;
  shopId: string;
  merchantAddress: string;
  city: string;
  area: string;
  saleStatus: ContentPackage['saleStatus'];
  originalPrice: number;
  resolvedSalePrice: number;
  welfarePrice: number;
  orderCount: number;
  paidOrderCount: number;
  stockTotal: number;
  stockLeft: number;
  currentStock: number;
}

export function combinedAreaName(city: string, area: string): string {
  if (!city) return area;
  if (!area || area.startsWith(city)) return city || area;
  return `${city}${area}`;
}

function mapSaleStatus(state: number): ContentPackage['saleStatus'] {
  if (state === 10) return 'selling';
  if (state === -20) return 'recycle';
  return 'pending';
}

export function readBargainCore(row: AnyRecord): BargainCoreValues | null {
  const packageId = rowText(row, [
    'id',
    'commodityId',
    'commodity_id',
    'goodsId',
    'goods_id',
    'packageId',
    'package_id',
    'productId',
    'product_id',
    'skuId'
  ]);
  if (!packageId) return null;

  const bargainState = Math.round(rowNumber(row, ['bargainState', 'bargain_state'], -10));
  const saleStatus = mapSaleStatus(bargainState);

  const packageName = rowText(
    row,
    [
      'commodityName',
      'commodity_name',
      'goodsName',
      'goods_name',
      'packageName',
      'package_name',
      'productName',
      'product_name',
      'title',
      'name'
    ],
    `commodity-${packageId}`
  );
  const merchantId = rowText(
    row,
    [
      'storeId',
      'store_id',
      'shopId',
      'shop_id',
      'merchantId',
      'merchant_id',
      'sellerId',
      'seller_id',
      'corePartnerId',
      'corePartner.id',
      'corePartnerShopIds'
    ],
    `merchant-${packageId}`
  );
  const merchantName = rowText(
    row,
    [
      'shopName',
      'shop_name',
      'storeName',
      'store_name',
      'merchantName',
      'merchant_name',
      'sellerName',
      'seller_name',
      'corePartnerShopName',
      'corePartner.name'
    ],
    'real-backend-merchant'
  );
  const merchantAddress = rowText(
    row,
    [
      'shopAddress',
      'shop_address',
      'storeAddress',
      'store_address',
      'address',
      'detailAddress',
      'detail_address',
      'contactAddress',
      'contact_address',
      'businessAddress',
      'business_address',
      'corePartner.address'
    ],
    ''
  );
  const shopId = rowText(
    row,
    ['corePartnerShopIds', 'corePartnerShopId', 'shopId', 'shop_id', 'storeId', 'store_id'],
    ''
  );
  const city = rowText(row, ['cityName', 'city_name', 'city']);
  const area =
    rowText(row, [
      'districtName',
      'district_name',
      'areaName',
      'area_name',
      'regionName',
      'region_name',
      'district',
      'area'
    ]) ||
    city ||
    'default-area';

  const originalPrice = rowMoney(
    row,
    ['marketPrice', 'market_price', 'originalPrice', 'original_price', 'linePrice', 'line_price'],
    ['marketPriceCents', 'market_price_cents', 'originalPriceCents', 'original_price_cents'],
    0
  );
  const fallbackSalePrice = rowMoney(
    row,
    [
      'bargainPrice',
      'bargain_price',
      'salePrice',
      'sale_price',
      'sellingPrice',
      'selling_price',
      'price',
      'payPrice',
      'pay_price'
    ],
    [
      'priceCents',
      'price_cents',
      'salePriceCents',
      'sale_price_cents',
      'bargainPriceCents',
      'bargain_price_cents'
    ],
    originalPrice
  );
  const welfarePrice = rowMoney(
    row,
    ['welfarePrice', 'welfare_price', 'bargainFloorPrice', 'bargain_floor_price'],
    [
      'welfarePriceCents',
      'welfare_price_cents',
      'bargainFloorPriceCents',
      'bargain_floor_price_cents'
    ],
    Number.NaN
  );
  const fixedPrice = rowMoney(
    row,
    ['fixedPrice', 'fixed_price', 'onePrice', 'one_price'],
    ['fixedPriceCents', 'fixed_price_cents', 'onePriceCents', 'one_price_cents'],
    Number.NaN
  );
  const temporaryPrice = rowMoney(
    row,
    [
      'temporaryPrice',
      'temporary_price',
      'tempPrice',
      'temp_price',
      'activityPrice',
      'activity_price'
    ],
    ['temporaryPriceCents', 'temporary_price_cents', 'tempPriceCents', 'temp_price_cents'],
    Number.NaN
  );
  const isFixedPrice = rowBoolean(row, [
    'isFixed',
    'is_fixed',
    'fixed',
    'fixedPriceEnabled',
    'fixed_price_enabled',
    'onePriceEnabled',
    'one_price_enabled'
  ]);
  const resolvedSalePrice =
    isFixedPrice && Number.isFinite(fixedPrice) && fixedPrice > 0
      ? fixedPrice
      : Number.isFinite(temporaryPrice) && temporaryPrice > 0
        ? temporaryPrice
        : fallbackSalePrice;

  const orderCount = Math.round(
    rowNumber(
      row,
      [
        'orderCount',
        'order_count',
        'saleNum',
        'sale_num',
        'soldCount',
        'sold_count',
        'salesVolume',
        'bargainCommodityDynamic.hasBargainAmount',
        'bargainCommodityDynamic.hasBargainCount'
      ],
      0
    )
  );
  const paidOrderCount = Math.round(
    rowNumber(
      row,
      ['paidOrderCount', 'paid_order_count', 'payNum', 'pay_num', 'paidNum', 'paid_num'],
      orderCount
    )
  );
  // 库存字段全部位于 JeeSite 响应的 bargainCommodityDynamic 嵌套 JSON 内。
  // listData 在不同 JeeSite 版本里既可能返回对象，也可能把这段 JSON
  // 序列化成字符串；rowNumber/valueAtPath 会统一处理这两种形态。
  //   hasInventory            = 当日/当前可用库存（-1 表示不限制/未启用库存）
  //   inventoryTotal          = 现在库存（随销售扣减）
  //   initialInventoryTotal   = 初始库存（上架时设定）
  // 顶层 stockLeft/surplusStock/remainingStock 字段在 JeeSite 响应中不存在，
  // 仅作兜底保留，不作为主路径。
  const initialStockFromRow = Math.round(
    rowNumber(
      row,
      [
        'bargainCommodityDynamic.initialInventoryTotal',
        'bargainCommodityDynamic.stockTotal',
        'bargainCommodityDynamic.totalStock',
        'bargainCommodityDynamic.stock',
        'bargainCommodityDynamic.inventory',
        'stockTotal',
        'stock_total',
        'totalStock',
        'total_stock',
        'stock',
        'stockNum',
        'stock_num',
        'inventory'
      ],
      Number.NaN
    )
  );
  const currentStockFromRow = Math.round(
    rowNumber(
      row,
      [
        'bargainCommodityDynamic.inventoryTotal',
        'bargainCommodityDynamic.totalInventory',
        'bargainCommodityDynamic.currentInventory',
        'bargainCommodityDynamic.currentStock',
        'inventoryTotal',
        'currentInventory',
        'currentStock'
      ],
      Number.NaN
    )
  );
  const dailyInventory = Math.round(
    rowNumber(row, ['bargainCommodityDynamic.hasInventory', 'hasInventory'], Number.NaN)
  );
  const stockLeftFromRow =
    Number.isFinite(dailyInventory) && dailyInventory >= 0
      ? dailyInventory
      : Math.round(
          rowNumber(
            row,
            [
              'bargainCommodityDynamic.remainingInventory',
              'bargainCommodityDynamic.inventory',
              'bargainCommodityDynamic.stockLeft',
              'bargainCommodityDynamic.stock_left',
              'bargainCommodityDynamic.remainingStock',
              'bargainCommodityDynamic.remaining_stock',
              'bargainCommodityDynamic.surplusStock',
              'bargainCommodityDynamic.surplus_stock',
              'bargainCommodityDynamic.leftStock',
              'bargainCommodityDynamic.left_stock',
              'inventory',
              'stockLeft',
              'stock_left',
              'surplusStock',
              'surplus_stock',
              'remainingStock',
              'remaining_stock',
              'leftStock',
              'left_stock'
            ],
            Number.NaN
          )
        );
  const stockTotal = Number.isFinite(initialStockFromRow)
    ? clampNonNegative(initialStockFromRow)
    : Number.isFinite(currentStockFromRow)
      ? clampNonNegative(currentStockFromRow)
      : clampNonNegative(orderCount + (Number.isFinite(stockLeftFromRow) ? stockLeftFromRow : 0));
  const stockLeft = Number.isFinite(stockLeftFromRow)
    ? clamp(stockLeftFromRow, 0, stockTotal || stockLeftFromRow)
    : clampNonNegative(stockTotal - orderCount);
  const currentStock = Number.isFinite(currentStockFromRow)
    ? clampNonNegative(currentStockFromRow)
    : stockLeft;

  return {
    packageId,
    packageName,
    merchantId,
    merchantName,
    shopId,
    merchantAddress,
    city,
    area,
    saleStatus,
    originalPrice,
    resolvedSalePrice,
    welfarePrice,
    orderCount,
    paidOrderCount,
    stockTotal,
    stockLeft,
    currentStock
  };
}
