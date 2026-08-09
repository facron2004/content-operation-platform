/** JeeSite pagination and OrderHeader ingestion for GMV refresh. */
import { isRecord } from '@content/shared';
import { Logger } from '@nestjs/common';
import { AutoLoginService } from '../content/auto-login.service';
import { normalizeJeesiteBaseUrl } from '../content/jeesite-url';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildJeesiteOrderListUrl,
  resolveCookie,
  upsertOrderHeaders,
  type GmvRefreshPageParams
} from './gmv-refresh-support';
import { fetchOrderPageWithRenewal } from './gmv-refresh-page';

export type { GmvRefreshPageParams } from './gmv-refresh-support';

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

export interface JeesitePullProgress {
  pagesFetched: number;
  fetched: number;
  upserted: number;
  skipped: number;
  errors: number;
}

export async function pullJeesiteOrders(params: {
  prisma: PrismaService;
  autoLogin?: AutoLoginService;
  startDate: string;
  endDate: string;
  logger: Logger;
  onProgress?: (p: JeesitePullProgress) => void;
}): Promise<{
  fetched: number;
  upserted: number;
  skipped: number;
  errors: number;
  pagesFetched: number;
  truncated: boolean;
}> {
  const { prisma, autoLogin, startDate, endDate, logger, onProgress } = params;
  const rawBaseUrl = process.env.EXTERNAL_API_BASE_URL;
  if (!rawBaseUrl) throw new Error('EXTERNAL_API_BASE_URL 未配置');
  // SSRF guard: same private/loopback rejection used by data-source/auto-login.
  const baseUrl = await normalizeJeesiteBaseUrl(rawBaseUrl);
  let cookieHeader: string | null | undefined = await resolveCookie(autoLogin, logger);
  // 异步 job 模式下没有 HTTP 超时压力，上限主要用于防御 JeeSite 翻页异常死循环。
  // 默认 1000 页 = 5 万单，可覆盖 30 天以上的正常回填量（此前 200 页会截断 30 天数据）。
  const PAGE_SIZE = 50,
    MAX_PAGES = Number(process.env.ETL_MAX_PAGES ?? '1000');
  let pageNo = 1,
    fetched = 0,
    upserted = 0,
    skipped = 0,
    errors = 0,
    truncated = true;
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
    if (page.done) {
      truncated = false;
      break;
    }
    fetched += page.rows.length;
    upserted += page.upserted;
    skipped += page.skipped;
    errors += page.errors;
    pageNo++;
    onProgress?.({ pagesFetched: pageNo, fetched, upserted, skipped, errors });
  }
  if (truncated) {
    logger.warn(
      `JeSite 拉单达到 MAX_PAGES=${MAX_PAGES} 上限（已抓 ${fetched} 单），[${startDate}→${endDate}] 数据可能不完整，可调大 ETL_MAX_PAGES 或缩小日期范围`
    );
  }
  return { fetched, upserted, skipped, errors, pagesFetched: pageNo, truncated };
}
