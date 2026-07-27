/** Consolidated GMV module. */
import { isRecord } from '@content/shared';
import { Logger } from '@nestjs/common';
import { withHeavyAggregateGate } from '../common';
import {
  JSON_RESPONSE_MAX_BYTES,
  readResponseText,
  ResponseBodyTooLargeError
} from '../common/response-body';
import { AutoLoginService } from '../content/auto-login.service';
import { assertHostnameNotPrivateAsync, normalizeJeesiteBaseUrl } from '../content/jeesite-url';
import { recomputeDailyMetricsRange, recomputePackageSalesAmountRange } from '../money';
import { MerchantSalesService } from '../merchant-sales/merchant-sales.service';
import { PrismaService } from '../prisma/prisma.service';
import { type OrderLike, batchUpsertOrderHeaders } from './gmv-order-header';

/** Cap for non-OK error bodies — never materialize multi-MB HTML into throw messages. */
const ERROR_BODY_MAX_BYTES = 8 * 1024;

// --- gmv-refresh-order-page.ts ---
/**
 * Fetch one JeeSite order list page.
 * Same-host single-hop redirect pin (parity with data-source / html-fetcher):
 * Cookie must never leave the origin host; private DNS rechecked on hop.
 */
export async function fetchOrderPage(url: URL, cookie: string): Promise<unknown | null> {
  const FETCH_TIMEOUT_MS = 30000,
    controller = new AbortController(),
    timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers = { Cookie: cookie, 'x-ajax': 'json', Accept: 'application/json' };
    let res = await fetch(url.toString(), {
      headers,
      redirect: 'manual',
      signal: controller.signal
    });
    // SSRF-safe single hop: only follow when hostname matches origin.
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (location) {
        const redirectUrl = new URL(location, url);
        if (
          (redirectUrl.protocol === 'http:' || redirectUrl.protocol === 'https:') &&
          redirectUrl.hostname === url.hostname
        ) {
          await assertHostnameNotPrivateAsync(redirectUrl.hostname);
          res = await fetch(redirectUrl.toString(), {
            headers,
            redirect: 'manual',
            signal: controller.signal
          });
        }
      }
    }
    if (!res.ok) {
      let snippet = '';
      try {
        snippet = await readResponseText(res, ERROR_BODY_MAX_BYTES);
      } catch {
        snippet = '[body unreadable]';
      }
      throw new Error(`JeSite HTTP ${res.status}: ${snippet.slice(0, 200).replace(/\s+/g, ' ')}`);
    }
    let rawText: string;
    try {
      rawText = await readResponseText(res, JSON_RESPONSE_MAX_BYTES);
    } catch (err) {
      if (err instanceof ResponseBodyTooLargeError) {
        throw new Error(`JeSite order page exceeds max ${JSON_RESPONSE_MAX_BYTES} bytes`);
      }
      throw err;
    }
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
  const result = await batchUpsertOrderHeaders(prisma, orders, 35);
  if (result.errors > 0) {
    logger.warn(
      `OrderHeader upsert partial failures: errors=${result.errors} samples=${result.errorSamples.join(',') || '(none)'}`
    );
  }
  return {
    upserted: result.upserted,
    skipped: result.skipped,
    errors: result.errors
  };
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
  const rawBaseUrl = process.env.EXTERNAL_API_BASE_URL;
  if (!rawBaseUrl) throw new Error('EXTERNAL_API_BASE_URL 未配置');
  // SSRF guard: same private/loopback rejection used by data-source/auto-login.
  const baseUrl = await normalizeJeesiteBaseUrl(rawBaseUrl);
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
  recomputeWarnings: string[];
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
  // Pull is network-bound (serialized via refreshTail). Recompute/write is the
  // SQLite-heavy phase — share the process-wide heavy gate so interactive GMV /
  // overview / refund cold aggregates queue instead of contending for the lock
  // (residual #85; deferred from #84 stampede package).
  const pull = await pullJeesiteOrders({ prisma, autoLogin, startDate, endDate, logger });
  const recomputeWarnings = await withHeavyAggregateGate(() =>
    runMoneyRecomputes({
      prisma,
      getMerchantSalesService,
      invalidateCache,
      startDate,
      endDate
    })
  );
  logger.log(
    `JeSite refresh [${startDate} → ${endDate}] pages=${pull.pagesFetched} fetched=${pull.fetched} upserted=${pull.upserted} errors=${pull.errors}${recomputeWarnings.length ? ` recomputeWarnings=${recomputeWarnings.join('; ')}` : ''}`
  );
  return { startDate, endDate, ...pull, recomputeWarnings };
}

/**
 * DailyMetrics + PSD + merchant-sales recompute after a JeSite order pull.
 * Kept as a single gate unit so partial failure still frees the slot once.
 */
async function runMoneyRecomputes(params: {
  prisma: PrismaService;
  getMerchantSalesService: () => Promise<MerchantSalesService | null>;
  invalidateCache: () => void;
  startDate: string;
  endDate: string;
}): Promise<string[]> {
  const { prisma, getMerchantSalesService, invalidateCache, startDate, endDate } = params;
  const recomputeWarnings: string[] = [];

  try {
    await recomputeDailyMetricsRange(prisma, startDate, endDate);
  } catch (e) {
    const msg = `DailyMetrics recompute failed: ${(e as Error).message}`;
    logger.warn(msg);
    recomputeWarnings.push(msg);
  }
  try {
    const psd = await recomputePackageSalesAmountRange(prisma, startDate, endDate);
    logger.log(
      `PSD salesAmount recompute [${startDate}→${endDate}] rows=${psd.rowsUpserted} coverage=${(psd.coverageRatio * 100).toFixed(1)}%`
    );
  } catch (e) {
    const msg = `PackageSalesDaily salesAmount recompute failed: ${(e as Error).message}`;
    logger.warn(msg);
    recomputeWarnings.push(msg);
  }

  try {
    const ms = await getMerchantSalesService();
    if (ms) await ms.recomputeRange(startDate, endDate);
  } catch (e) {
    const msg = `merchant-sales recomputeRange failed: ${(e as Error).message}`;
    logger.warn(msg);
    recomputeWarnings.push(msg);
  }
  // Invalidate only after all money writers finish so cold GMV/overview/refund
  // loads do not stampede mid MDM DELETE+INSERT (residual #85).
  invalidateCache();
  return recomputeWarnings;
}
