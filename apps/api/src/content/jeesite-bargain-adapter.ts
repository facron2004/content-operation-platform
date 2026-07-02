import type { ContentPackage, SalesSnapshot } from '@content/shared';
import { isRecord } from '@content/shared';
import { clamp, clampNonNegative, MS_PER_DAY } from '../domain/utils';
import { safeRatio, nowISO } from '../common/format';
import { splitList } from './mappers';

// URL 归一化与 SSRF 防御已下沉到独立模块,这里 re-export 以保持旧的导入路径不破坏,
// 同时在文件内 import 引用,以支持 mapJeesiteBargainListToDataset 内部调用。
import {
  adminFormUrl,
  assertHostnameNotPrivateAsync,
  normalizeJeesiteBaseUrl,
  normalizeJeesiteBaseUrlSync
} from './jeesite-url';

export {
  adminFormUrl,
  assertHostnameNotPrivateAsync,
  normalizeJeesiteBaseUrl,
  normalizeJeesiteBaseUrlSync
};

type AnyRecord = Record<string, unknown>;

type DatasetOptions = {
  baseUrl?: string;
  now?: string;
};

const listKeys = ['list', 'rows', 'records', 'items', 'data', 'page', 'result'] as const;

type RowFieldSet = readonly string[];

const extractRows = (value: unknown): AnyRecord[] => {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }

  if (!isRecord(value)) return [];

  for (const key of listKeys) {
    const nested = value[key];
    if (Array.isArray(nested)) return nested.filter(isRecord);
    if (isRecord(nested)) {
      const rows = extractRows(nested);
      if (rows.length > 0) return rows;
    }
  }

  return [];
};

const valueAtPath = (row: AnyRecord, key: string): unknown => {
  if (!key.includes('.')) return row[key];

  let current: unknown = row;
  for (const part of key.split('.')) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
};

const pick = (row: AnyRecord, keys: readonly string[]) => {
  for (const key of keys) {
    const value = valueAtPath(row, key);
    if (value != null && value !== '') return value;
  }
  return undefined;
};

const text = (row: AnyRecord, keys: RowFieldSet, fallback = '') => {
  const value = pick(row, keys);
  return value === undefined ? fallback : String(value).trim();
};

const number = (row: AnyRecord, keys: RowFieldSet, fallback = 0) => {
  const value = pick(row, keys);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').replace(/[^\d.-]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'y', 'on', '是', '开启', '启用']);
const FALSY_VALUES = new Set(['0', 'false', 'no', 'n', 'off', '否', '关闭', '禁用']);

const boolean = (row: AnyRecord, keys: RowFieldSet, fallback = false) => {
  const value = pick(row, keys);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (TRUTHY_VALUES.has(normalized)) return true;
    if (FALSY_VALUES.has(normalized)) return false;
  }
  return fallback;
};

const money = (row: AnyRecord, yuanKeys: RowFieldSet, centKeys: RowFieldSet, fallback = 0) => {
  const cents = number(row, centKeys, Number.NaN);
  if (Number.isFinite(cents)) return Math.round((cents / 100) * 100) / 100;
  return number(row, yuanKeys, fallback);
};

const ratio = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value > 1 ? value / 100 : value;
};

const dateText = (row: AnyRecord, keys: RowFieldSet, fallback: string) => {
  const value = text(row, keys);
  if (!value) return fallback;
  const normalized = value.includes(' ') ? value.replace(' ', 'T') : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
};

const areaName = (city: string, area: string) => {
  if (!city) return area;
  if (!area || area.startsWith(city)) return city || area;
  return `${city}${area}`;
};

const mapSaleStatus = (state: number): ContentPackage['saleStatus'] => {
  if (state === 10) return 'selling';
  if (state === -20) return 'recycle';
  return 'pending';
};

export function mapJeesiteBargainListToDataset(
  payload: unknown,
  options: DatasetOptions = {}
): { packages: ContentPackage[]; snapshots: SalesSnapshot[] } {
  const rows = extractRows(payload);
  const now = options.now ?? nowISO();
  const packages: ContentPackage[] = [];
  const snapshots: SalesSnapshot[] = [];

  for (const row of rows) {
    const packageId = text(row, [
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
    if (!packageId) continue;

    const bargainState = Math.round(number(row, ['bargainState', 'bargain_state'], -10));
    const saleStatus = mapSaleStatus(bargainState);
    if (saleStatus !== 'selling') continue;

    const packageName = text(
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
    const merchantId = text(
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
    const merchantName = text(
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
    const city = text(row, ['cityName', 'city_name', 'city']);
    const area =
      text(row, [
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
    const originalPrice = money(
      row,
      ['marketPrice', 'market_price', 'originalPrice', 'original_price', 'linePrice', 'line_price'],
      ['marketPriceCents', 'market_price_cents', 'originalPriceCents', 'original_price_cents'],
      0
    );
    const fallbackSalePrice = money(
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
    const welfarePrice = money(
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
    const fixedPrice = money(
      row,
      ['fixedPrice', 'fixed_price', 'onePrice', 'one_price'],
      ['fixedPriceCents', 'fixed_price_cents', 'onePriceCents', 'one_price_cents'],
      Number.NaN
    );
    const temporaryPrice = money(
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
    const isFixedPrice = boolean(row, [
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
      number(
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
      number(
        row,
        ['paidOrderCount', 'paid_order_count', 'payNum', 'pay_num', 'paidNum', 'paid_num'],
        orderCount
      )
    );
    const stockTotalFromRow = Math.round(
      number(
        row,
        [
          'bargainCommodityDynamic.initialInventoryTotal',
          'stockTotal',
          'stock_total',
          'totalStock',
          'total_stock',
          'stock',
          'stockNum',
          'stock_num',
          'inventory',
          'bargainCommodityDynamic.initialInventoryTotal'
        ],
        Number.NaN
      )
    );
    const stockLeftFromRow = (() => {
      // 后台表格列 dataGrid_hasInventory 对应 hasInventory，强制以该字段为准
      const dailyInventory = Math.round(
        number(row, ['hasInventory', 'bargainCommodityDynamic.hasInventory'], Number.NaN)
      );
      if (Number.isFinite(dailyInventory) && dailyInventory >= 0) return dailyInventory;

      return Math.round(
        number(
          row,
          [
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
    })();
    const stockTotal = Number.isFinite(stockTotalFromRow)
      ? clampNonNegative(stockTotalFromRow)
      : clampNonNegative(orderCount + (Number.isFinite(stockLeftFromRow) ? stockLeftFromRow : 0));
    const stockLeft = Number.isFinite(stockLeftFromRow)
      ? clamp(stockLeftFromRow, 0, stockTotal || stockLeftFromRow)
      : clampNonNegative(stockTotal - orderCount);

    const useRules = splitList(
      text(row, [
        'useRule',
        'use_rule',
        'rules',
        'rule',
        'limitDesc',
        'limit_desc',
        'notice',
        'tagText',
        'tag_text'
      ])
    );
    const sellingPoints = splitList(
      text(row, [
        'sellPoint',
        'sell_point',
        'sellingPoint',
        'selling_point',
        'subtitle',
        'summary',
        'description'
      ])
    );
    const exposureCount = Math.round(
      number(
        row,
        [
          'exposureCount',
          'exposure_count',
          'visitNum',
          'visit_num',
          'viewCount',
          'view_count',
          'pv',
          'bargainCommodityDynamic.hasHeatCount'
        ],
        Math.max(100, orderCount * 20)
      )
    );
    const clickCount = Math.round(
      number(
        row,
        ['clickCount', 'click_count', 'clickNum', 'click_num', 'uv'],
        Math.max(1, orderCount * 3)
      )
    );
    const refundCount = Math.round(
      number(row, ['refundCount', 'refund_count', 'refundNum', 'refund_num'], 0)
    );
    const verifyCount = Math.round(
      number(
        row,
        ['verifyCount', 'verify_count', 'verifyNum', 'verify_num', 'usedCount', 'used_count'],
        0
      )
    );
    const gmv = money(
      row,
      ['gmv', 'paidAmount', 'paid_amount', 'salesAmount', 'sales_amount'],
      ['paidAmountCents', 'paid_amount_cents'],
      paidOrderCount * resolvedSalePrice
    );
    const refundAmount = money(
      row,
      ['refundAmount', 'refund_amount'],
      ['refundAmountCents', 'refund_amount_cents'],
      refundCount * resolvedSalePrice
    );
    const soldCount = clampNonNegative(stockTotal - stockLeft);
    const startTime = dateText(
      row,
      [
        'startTime',
        'start_time',
        'startDate',
        'start_date',
        'beginTime',
        'begin_time',
        'createDate',
        'createdAt'
      ],
      now
    );
    const endTime = dateText(
      row,
      [
        'endTime',
        'end_time',
        'expireDate',
        'expire_date',
        'finishTime',
        'finish_time',
        'expireTime',
        'expire_time'
      ],
      new Date(Date.now() + MS_PER_DAY * 7).toISOString()
    );
    const rating = number(row, ['rating', 'score', 'merchantScore', 'merchant_score'], 4.6);
    const scoreSeed = rating > 5 ? rating : rating * 18;

    const bargainType = Math.round(
      number(row, ['bargainType', 'bargain_type', 'commodityType', 'commodity_type'], 1)
    );

    packages.push({
      packageId,
      packageName,
      packageType: bargainType === 2 ? 'welfare' : 'commission',
      merchantId,
      merchantName,
      areaId: area,
      areaName: areaName(city, area),
      category: text(
        row,
        [
          'categoryName',
          'category_name',
          'category',
          'typeName',
          'type_name',
          'bargainCommodityTag.name'
        ],
        '未分类'
      ),
      originalPrice: originalPrice || resolvedSalePrice,
      salePrice: resolvedSalePrice,
      welfarePrice: Number.isFinite(welfarePrice) && welfarePrice > 0 ? welfarePrice : null,
      temporarySalePrice: resolvedSalePrice > 0 ? resolvedSalePrice : null,
      commissionRate: ratio(number(row, ['commissionRate', 'commission_rate', 'ratio'], 12)),
      grossProfit:
        Math.round(
          resolvedSalePrice *
            ratio(number(row, ['commissionRate', 'commission_rate', 'ratio'], 12)) *
            100
        ) / 100,
      stockTotal,
      stockLeft,
      startTime,
      endTime,
      useRules,
      sellingPoints,
      fallbackPackageId: null,
      miniProgramPath: text(
        row,
        ['miniProgramPath', 'mini_program_path', 'detailUrl', 'detail_url'],
        adminFormUrl(options.baseUrl, packageId)
      ),
      detailSummary: text(
        row,
        [
          'commodityDesc',
          'commodity_desc',
          'description',
          'detail',
          'detailText',
          'detail_text',
          'introduce',
          'content'
        ],
        ''
      ),
      saleStatus,
      merchantCooperationScore: clamp(Math.round(scoreSeed), 60, 98),
      areaMatchScore: 82,
      timeMatchScore: 80,
      historyScore: clamp(Math.round(scoreSeed - 2), 58, 96)
    });

    snapshots.push({
      packageId,
      areaId: area,
      merchantId,
      snapshotTime: now,
      exposureCount,
      clickCount,
      orderCount,
      paidOrderCount,
      refundCount,
      verifyCount,
      gmv,
      paidAmount: gmv,
      refundAmount,
      conversionRate: safeRatio(orderCount, clickCount),
      verifyRate: safeRatio(verifyCount, paidOrderCount),
      refundRate: safeRatio(refundCount, paidOrderCount),
      sellThroughRate: safeRatio(soldCount, stockTotal),
      remainingStock: stockLeft,
      salesSpeed: Math.max(
        0,
        Math.round(number(row, ['salesSpeed', 'sales_speed'], Math.max(1, orderCount / 3)))
      )
    });
  }

  return { packages, snapshots };
}
