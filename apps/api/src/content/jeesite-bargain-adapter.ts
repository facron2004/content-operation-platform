import type { ContentPackage, SalesSnapshot } from '@content/shared';
import { clamp } from '../domain/utils';
import { splitList } from './mappers';

type AnyRecord = Record<string, unknown>;

type DatasetOptions = {
  baseUrl?: string;
  now?: string;
};

const listKeys = ['list', 'rows', 'records', 'items', 'data', 'page', 'result'] as const;

type RowFieldSet = readonly string[];

const isRecord = (value: unknown): value is AnyRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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
    if (value !== undefined && value !== null && value !== '') return value;
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

const boolean = (row: AnyRecord, keys: RowFieldSet, fallback = false) => {
  const value = pick(row, keys);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on', '是', '开启', '启用'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n', 'off', '否', '关闭', '禁用'].includes(normalized)) return false;
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

export const adminFormUrl = (baseUrl: string | undefined, id: string) => {
  const normalized = normalizeJeesiteBaseUrlSync(baseUrl || 'https://zdm.zhsh1.cn/a');
  return `${normalized}/bargain/bargainCommodity/form?id=${encodeURIComponent(id)}`;
};

/**
 * 同步版本:仅做字面 URL 解析 + 协议 + 字面 IP 私网校验。
 * 主机名形式的 DNS 解析放给 {@link normalizeJeesiteBaseUrl} (async)。
 * 仅在不需要发起网络请求的纯字符串场景(如拼详情 URL)使用。
 */
export function normalizeJeesiteBaseUrlSync(rawUrl: string) {
  const trimmed = rawUrl.trim().replace(/\/$/, '');
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid URL: ${trimmed}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`URL must be http(s); got ${parsed.protocol}`);
  }
  assertHostnameNotPrivate(parsed.hostname);
  const adminIndex = parsed.pathname.indexOf('/a/');
  if (parsed.pathname === '/a' || parsed.pathname.startsWith('/a/')) {
    return `${parsed.origin}${adminIndex >= 0 ? parsed.pathname.slice(0, adminIndex + 2) : '/a'}`.replace(
      /\/$/,
      ''
    );
  }
  return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '');
}

/**
 * 异步版本:在同步校验基础上,额外做主机名 → IP 的 DNS 解析校验,
 * 防止攻击者把 DNS 指向私网/loopback 绕过同步层。
 */
export async function normalizeJeesiteBaseUrl(rawUrl: string) {
  const normalized = normalizeJeesiteBaseUrlSync(rawUrl);
  // 重新解析已归一化的 URL,拿到 hostname 做异步 DNS 校验
  const url = new URL(normalized);
  await assertHostnameNotPrivateAsync(url.hostname);
  return normalized;
}

/**
 * 拒绝指向私网 / loopback / metadata / link-local 的主机名,防止 SSRF。
 * IPv6 走单独的快速路径;主机名形式用异步 DNS 解析再判。
 *
 * 注意:此函数可能被同步调用点触发,我们在这里只处理"字面 IP/字面 IPv6"。
 * 主机名形式 → 在 fetch 之前通过 {@link assertHostnameNotPrivateAsync} 异步解析并校验。
 */
function assertHostnameNotPrivate(hostname: string) {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost') {
    throw new Error('EXTERNAL_API_BASE_URL must not point to localhost');
  }

  // IPv6: 任意形式的私网/loopback/link-local 都拒绝,只放行公网 IPv6
  if (lower.includes(':')) {
    if (
      lower === '::1' ||
      lower === '::' ||
      lower.startsWith('fe80:') ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('::ffff:')
    ) {
      throw new Error(`EXTERNAL_API_BASE_URL must not use private/loopback IPv6 (${hostname})`);
    }
    return;
  }

  // IPv4 字面量直接判
  const ipv4 = parseIpv4(lower);
  if (ipv4) {
    if (isPrivateIpv4(ipv4)) {
      throw new Error(`EXTERNAL_API_BASE_URL must not point to private/loopback IP (${hostname})`);
    }
    return;
  }

  // 主机名(非字面 IP) → 静态层放过,在 fetch 路径上做异步 DNS 校验
}

/**
 * 异步 SSRF 校验:解析主机名,任意解析结果命中私网/loopback 即抛错。
 * 应在每次 fetch 前调用一次(命中 5 分钟缓存则不必重复)。
 */
export async function assertHostnameNotPrivateAsync(hostname: string): Promise<void> {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost') {
    throw new Error(`EXTERNAL_API_BASE_URL must not point to localhost`);
  }
  // 字面 IP 走同步路径
  if (lower.includes(':') || parseIpv4(lower)) {
    assertHostnameNotPrivate(lower);
    return;
  }
  // 主机名 → 异步解析
  const dns = require('node:dns') as typeof import('node:dns');
  let addrs: Array<{ address: string }>;
  try {
    addrs = await new Promise<Array<{ address: string }>>((resolveAll, reject) => {
      dns.lookup(lower, { all: true }, (err, addresses) => {
        if (err) reject(err);
        else resolveAll(addresses);
      });
    });
  } catch (err) {
    throw new Error(
      `EXTERNAL_API_BASE_URL DNS resolution failed for ${hostname}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  for (const { address } of addrs) {
    if (address.includes(':')) {
      throw new Error(`EXTERNAL_API_BASE_URL resolves to IPv6 (${hostname} -> ${address}); IPv6 not allowed for safety`);
    }
    const ip = parseIpv4(address);
    if (ip && isPrivateIpv4(ip)) {
      throw new Error(`EXTERNAL_API_BASE_URL resolves to private/loopback IP (${hostname} -> ${address})`);
    }
  }
}

function parseIpv4(host: string): number | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    result = result * 256 + n;
  }
  return result;
}

function isPrivateIpv4(ip: number): boolean {
  const oct1 = (ip >>> 24) & 0xff;
  const oct2 = (ip >>> 16) & 0xff;
  // 10.0.0.0/8
  if (oct1 === 10) return true;
  // 172.16.0.0/12
  if (oct1 === 172 && oct2 >= 16 && oct2 <= 31) return true;
  // 192.168.0.0/16
  if (oct1 === 192 && oct2 === 168) return true;
  // 127.0.0.0/8 loopback
  if (oct1 === 127) return true;
  // 169.254.0.0/16 link-local (含云 metadata 169.254.169.254)
  if (oct1 === 169 && oct2 === 254) return true;
  // 0.0.0.0/8
  if (oct1 === 0) return true;
  // 100.64.0.0/10 CGNAT
  if (oct1 === 100 && oct2 >= 64 && oct2 <= 127) return true;
  return false;
}

export function mapJeesiteBargainListToDataset(
  payload: unknown,
  options: DatasetOptions = {}
): { packages: ContentPackage[]; snapshots: SalesSnapshot[] } {
  const rows = extractRows(payload);
  const now = options.now ?? new Date().toISOString();
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
      ? Math.max(0, stockTotalFromRow)
      : Math.max(0, orderCount + (Number.isFinite(stockLeftFromRow) ? stockLeftFromRow : 0));
    const stockLeft = Number.isFinite(stockLeftFromRow)
      ? clamp(stockLeftFromRow, 0, stockTotal || stockLeftFromRow)
      : Math.max(0, stockTotal - orderCount);

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
    const soldCount = Math.max(0, stockTotal - stockLeft);
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
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
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
      conversionRate: clickCount === 0 ? 0 : Number((orderCount / clickCount).toFixed(4)),
      verifyRate: paidOrderCount === 0 ? 0 : Number((verifyCount / paidOrderCount).toFixed(4)),
      refundRate: paidOrderCount === 0 ? 0 : Number((refundCount / paidOrderCount).toFixed(4)),
      sellThroughRate: stockTotal === 0 ? 0 : Number((soldCount / stockTotal).toFixed(4)),
      remainingStock: stockLeft,
      salesSpeed: Math.max(
        0,
        Math.round(number(row, ['salesSpeed', 'sales_speed'], Math.max(1, orderCount / 3)))
      )
    });
  }

  return { packages, snapshots };
}
