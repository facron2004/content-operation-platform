/** Consolidated GMV module. */
import { isRecord } from '@content/shared';
import { Logger } from '@nestjs/common';
import { AutoLoginService } from '../content/auto-login.service';
import { recomputeDailyMetricsRange, recomputePackageSalesAmountRange } from '../money';
import { MerchantSalesService } from '../merchant-sales/merchant-sales.service';
import { PrismaService } from '../prisma/prisma.service';
import { type OrderLike, upsertOrderHeaderIso } from './gmv-order-header';

// --- gmv-refresh-order-page.ts ---
export async function fetchOrderPage(url: URL, cookie: string): Promise<unknown | null> {
  const FETCH_TIMEOUT_MS = 30000,
    controller = new AbortController(),
    timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      headers: { Cookie: cookie, 'x-ajax': 'json', Accept: 'application/json' },
      redirect: 'manual',
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`JeSite HTTP ${res.status}: ${await res.text()}`);
    const rawText = await res.text();
    if (rawText.trimStart().startsWith('<')) return null;
    try {
      const parsed = JSON.parse(rawText) as unknown;
      if (isRecord(parsed) && parsed.result === 'login') return null;
      return parsed;
    } catch {
      return null;
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

// --- gmv-refresh-page-types.ts ---
export type GmvRefreshPageParams = {
  prisma: PrismaService;
  autoLogin?: AutoLoginService;
  baseUrl: string;
  startDate: string;
  endDate: string;
  pageNo: number;
  pageSize: number;
  cookieHeader: string | null | undefined;
  logger: Logger;
};

// --- gmv-refresh-page-fetch.ts ---
export function buildJeesiteOrderListUrl(
  baseUrl: string,
  startDate: string,
  endDate: string,
  pageNo: number,
  pageSize: number
): URL {
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/bargain/bargainOrder/listData`);
  url.searchParams.set('pageNo', String(pageNo));
  url.searchParams.set('pageSize', String(pageSize));
  url.searchParams.set('screeningStartPayDate', `${startDate} 00:00:00`);
  url.searchParams.set('screeningEndPayDate', `${endDate} 23:59:59`);
  return url;
}
export async function fetchOrderPageWithRenewal(params: {
  url: URL;
  cookieHeader: string | null | undefined;
  autoLogin?: AutoLoginService;
  logger: Logger;
}) {
  let cookieHeader = params.cookieHeader,
    payload = await fetchOrderPage(params.url, cookieHeader ?? '');
  if (!payload && params.autoLogin) {
    params.logger.warn('JeeSite session expired during GMV refresh, renewing once');
    params.autoLogin.clearCache();
    cookieHeader = (await params.autoLogin.ensureValidCookie(true)) ?? cookieHeader;
    if (cookieHeader) payload = await fetchOrderPage(params.url, cookieHeader);
  }
  return { payload, cookieHeader };
}

// --- gmv-refresh-fetch.ts ---
export async function resolveCookie(
  autoLogin: AutoLoginService | undefined,
  logger: Logger
): Promise<string> {
  let cookieHeader: string | null = null;
  if (autoLogin) {
    try {
      cookieHeader = await autoLogin.ensureValidCookie();
    } catch (e) {
      logger.warn(`AutoLogin 失败,降级到 env cookie: ${(e as Error).message}`);
    }
  }
  if (!cookieHeader) {
    const envCookie =
      process.env.JEESITE_SESSION_ID ??
      process.env.JEESITE_COOKIE ??
      process.env.EXTERNAL_API_COOKIE ??
      '';
    if (!envCookie) throw new Error('没有可用的 JeSite cookie (env 也没配)');
    cookieHeader = envCookie.includes('=') ? envCookie : `jeesite.session.id=${envCookie}`;
  }
  return cookieHeader;
}

// --- gmv-refresh-upsert.ts ---
export async function upsertOrderHeaders(
  prisma: PrismaService,
  orders: OrderLike[],
  logger: Logger
): Promise<{ upserted: number; skipped: number; errors: number }> {
  let upserted = 0,
    skipped = 0,
    errors = 0;
  for (const o of orders) {
    if (!o.orderId) {
      skipped++;
      continue;
    }
    try {
      // Raw ISO upsert — Prisma DateTime lands as integer epoch and breaks
      // ISO-string paidTime day-range queries used by GMV KPI/DailyMetrics.
      await upsertOrderHeaderIso(prisma, o);
      upserted++;
    } catch (e) {
      errors++;
      logger.warn(`upsert ${o.orderId} 失败: ${(e as Error).message}`);
    }
  }
  return { upserted, skipped, errors };
}

// --- gmv-refresh-page.ts ---
export async function pullJeesiteOrderPage(params: GmvRefreshPageParams) {
  const { prisma, autoLogin, baseUrl, startDate, endDate, pageNo, pageSize, logger } = params;
  const url = buildJeesiteOrderListUrl(baseUrl, startDate, endDate, pageNo, pageSize);
  const { payload, cookieHeader } = await fetchOrderPageWithRenewal({
    url,
    cookieHeader: params.cookieHeader,
    autoLogin,
    logger
  });
  if (!isRecord(payload))
    throw new Error(
      'JeeSite login expired and automatic renewal failed; check EXTERNAL_API_USERNAME/PASSWORD'
    );
  const rows = payload.list ?? payload.rows ?? [];
  if (!Array.isArray(rows)) throw new Error('JeSite order API returned an invalid payload');
  if (rows.length === 0)
    return { rows: [], cookieHeader, upserted: 0, skipped: 0, errors: 0, done: true };
  const { mapJeesiteOrderListToDataset } = await import('../content/jeesite-bargain-adapter');
  const { orders } = mapJeesiteOrderListToDataset(payload),
    result = await upsertOrderHeaders(prisma, orders, logger);
  return {
    rows,
    cookieHeader,
    upserted: result.upserted,
    skipped: result.skipped,
    errors: result.errors,
    done: false
  };
}

// --- gmv-refresh-pull.ts ---
export async function pullJeesiteOrders(params: {
  prisma: PrismaService;
  autoLogin?: AutoLoginService;
  startDate: string;
  endDate: string;
  logger: Logger;
}): Promise<{
  fetched: number;
  upserted: number;
  skipped: number;
  errors: number;
  pagesFetched: number;
}> {
  const { prisma, autoLogin, startDate, endDate, logger } = params;
  const baseUrl = process.env.EXTERNAL_API_BASE_URL;
  if (!baseUrl) throw new Error('EXTERNAL_API_BASE_URL 未配置');
  let cookieHeader: string | null | undefined = await resolveCookie(autoLogin, logger);
  const PAGE_SIZE = 50,
    MAX_PAGES = Number(process.env.ETL_MAX_PAGES ?? '200');
  let pageNo = 1,
    fetched = 0,
    upserted = 0,
    skipped = 0,
    errors = 0;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await pullJeesiteOrderPage({
      prisma,
      autoLogin,
      baseUrl,
      startDate,
      endDate,
      pageNo,
      pageSize: PAGE_SIZE,
      cookieHeader,
      logger
    });
    cookieHeader = page.cookieHeader;
    if (page.done) break;
    fetched += page.rows.length;
    upserted += page.upserted;
    skipped += page.skipped;
    errors += page.errors;
    pageNo++;
  }
  return { fetched, upserted, skipped, errors, pagesFetched: pageNo };
}

// --- gmv-refresh.ts ---
const logger = new Logger('GmvRefresh');
export interface GmvRefreshResult {
  startDate: string;
  endDate: string;
  fetched: number;
  upserted: number;
  skipped: number;
  errors: number;
  pagesFetched: number;
}
export async function refreshGmvFromJeesite(params: {
  prisma: PrismaService;
  autoLogin?: AutoLoginService;
  getMerchantSalesService: () => Promise<MerchantSalesService | null>;
  invalidateCache: () => void;
  startDate: string;
  endDate: string;
}): Promise<GmvRefreshResult> {
  const { prisma, autoLogin, getMerchantSalesService, invalidateCache, startDate, endDate } =
    params;
  const pull = await pullJeesiteOrders({ prisma, autoLogin, startDate, endDate, logger });

  try {
    await recomputeDailyMetricsRange(prisma, startDate, endDate);
  } catch (e) {
    logger.warn(`DailyMetrics recompute failed: ${(e as Error).message}`);
  }
  try {
    const psd = await recomputePackageSalesAmountRange(prisma, startDate, endDate);
    logger.log(
      `PSD salesAmount recompute [${startDate}→${endDate}] rows=${psd.rowsUpserted} coverage=${(psd.coverageRatio * 100).toFixed(1)}%`
    );
  } catch (e) {
    logger.warn(`PackageSalesDaily salesAmount recompute failed: ${(e as Error).message}`);
  }

  invalidateCache();
  try {
    const ms = await getMerchantSalesService();
    if (ms) await ms.recomputeRange(startDate, endDate);
  } catch (e) {
    logger.warn(`merchant-sales recomputeRange failed: ${(e as Error).message}`);
  }
  logger.log(
    `JeSite refresh [${startDate} → ${endDate}] pages=${pull.pagesFetched} fetched=${pull.fetched} upserted=${pull.upserted} errors=${pull.errors}`
  );
  return { startDate, endDate, ...pull };
}
