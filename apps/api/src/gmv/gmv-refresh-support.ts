import { Logger } from '@nestjs/common';
import { AutoLoginService } from '../content/auto-login.service';
import { PrismaService } from '../prisma/prisma.service';
import { type OrderLike, batchUpsertOrderHeaders } from './gmv-order-header';

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

export type FetchOrderPage = (url: URL, cookie: string) => Promise<unknown | null>;

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
  fetchPage: FetchOrderPage;
}) {
  let cookieHeader = params.cookieHeader,
    payload = await params.fetchPage(params.url, cookieHeader ?? '');
  if (!payload && params.autoLogin) {
    params.logger.warn('JeeSite session expired during GMV refresh, renewing once');
    params.autoLogin.clearCache();
    cookieHeader = (await params.autoLogin.ensureValidCookie(true)) ?? cookieHeader;
    if (cookieHeader) payload = await params.fetchPage(params.url, cookieHeader);
  }
  return { payload, cookieHeader };
}

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
