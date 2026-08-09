/** Consolidated GMV refresh compatibility facade. */
import { Logger } from '@nestjs/common';
import { withHeavyAggregateGate } from '../common';
import { AutoLoginService } from '../content/auto-login.service';
import { MerchantSalesService } from '../merchant-sales/merchant-sales.service';
import { PrismaService } from '../prisma/prisma.service';
import { runMoneyRecomputes } from './gmv-refresh-recompute';
import { pullJeesiteOrders, type JeesitePullProgress } from './gmv-refresh-pull';

export { fetchOrderPage, fetchOrderPageWithRenewal } from './gmv-refresh-page';
export { pullJeesiteOrderPage, pullJeesiteOrders } from './gmv-refresh-pull';
export type { JeesitePullProgress } from './gmv-refresh-pull';
export { buildJeesiteOrderListUrl, resolveCookie, upsertOrderHeaders } from './gmv-refresh-support';
export type { GmvRefreshPageParams } from './gmv-refresh-support';

const logger = new Logger('GmvRefresh');

export interface GmvRefreshResult {
  startDate: string;
  endDate: string;
  fetched: number;
  upserted: number;
  skipped: number;
  errors: number;
  pagesFetched: number;
  truncated?: boolean;
  /** External pull failures are visible even when local recompute can continue. */
  pullWarnings: string[];
  recomputeWarnings: string[];
}

export async function refreshGmvFromJeesite(params: {
  prisma: PrismaService;
  autoLogin?: AutoLoginService;
  getMerchantSalesService: () => Promise<MerchantSalesService | null>;
  invalidateCache: () => void;
  startDate: string;
  endDate: string;
  onProgress?: (p: JeesitePullProgress) => void;
  onPhase?: (phase: 'pull' | 'recompute') => void;
}): Promise<GmvRefreshResult> {
  const {
    prisma,
    autoLogin,
    getMerchantSalesService,
    invalidateCache,
    startDate,
    endDate,
    onProgress,
    onPhase
  } = params;

  let pull = { fetched: 0, upserted: 0, skipped: 0, errors: 0, pagesFetched: 0, truncated: false };
  const pullWarnings: string[] = [];
  try {
    onPhase?.('pull');
    pull = await pullJeesiteOrders({
      prisma,
      autoLogin,
      startDate,
      endDate,
      logger,
      onProgress
    });
  } catch (err: unknown) {
    const message = `JeSite pull failed: ${(err as Error).message}`;
    logger.warn(
      `JeSite 外部拉单未能完成 (${(err as Error).message})，将使用本地已有 OrderHeader 记录重算`
    );
    pullWarnings.push(message);
  }

  onPhase?.('recompute');
  const recomputeWarnings = await withHeavyAggregateGate(() =>
    runMoneyRecomputes({
      prisma,
      getMerchantSalesService,
      invalidateCache,
      startDate,
      endDate,
      logger
    })
  );
  if (pull.truncated) {
    recomputeWarnings.push(
      `拉单达到页数上限（${pull.pagesFetched} 页 / ${pull.fetched} 单），该日期范围数据可能不完整，建议缩小范围后重试`
    );
  }
  logger.log(
    `JeSite refresh [${startDate} → ${endDate}] pages=${pull.pagesFetched} fetched=${pull.fetched} upserted=${pull.upserted} errors=${pull.errors}${pullWarnings.length ? ` pullWarnings=${pullWarnings.join('; ')}` : ''}${recomputeWarnings.length ? ` recomputeWarnings=${recomputeWarnings.join('; ')}` : ''}`
  );
  return { startDate, endDate, ...pull, pullWarnings, recomputeWarnings };
}
