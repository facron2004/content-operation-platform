/** Assemble the paidTime-scoped data-analysis report from its query layers. */
import type { DataAnalysisReport, DataAnalysisWindow } from './data-analysis.dto';
import {
  queryHourly,
  queryMerchantRanking,
  queryMerchantRefunds,
  queryMerchantVerifyExtremes,
  queryOrderDetails,
  queryOverview,
  querySalesmanRanking,
  querySalesmanRefunds,
  querySalesmanVerifyExtremes,
  queryTimeSlots
} from './data-analysis-query';
import type { PrismaLike } from './data-analysis-query.shared';
import { DATA_ANALYSIS_READ_MAX_DAYS, resolveAnalysisWindow } from './data-analysis-window';
import {
  DATA_ANALYSIS_DETAIL_MAX_ROWS,
  DATA_ANALYSIS_OH_CONCURRENCY,
  DATA_ANALYSIS_RANKING_MAX_ROWS,
  mapPool
} from '../common/sql-chunk';

export type DataAnalysisReportOptions = {
  includeDetails: boolean;
  refundLimit?: number;
};

export async function buildDataAnalysisReport(
  prisma: PrismaLike,
  window: DataAnalysisWindow,
  date: string | undefined,
  endDate: string | undefined,
  detailLimit: number,
  rankingLimit: number,
  opts: DataAnalysisReportOptions = { includeDetails: true }
): Promise<DataAnalysisReport> {
  const { start, end } = resolveAnalysisWindow(window, date, endDate);
  const safeDetailLimit = Math.min(
    DATA_ANALYSIS_DETAIL_MAX_ROWS,
    Math.max(1, Math.floor(detailLimit) || DATA_ANALYSIS_DETAIL_MAX_ROWS)
  );
  const safeRankingLimit = Math.min(
    DATA_ANALYSIS_RANKING_MAX_ROWS,
    Math.max(1, Math.floor(rankingLimit) || 500)
  );
  const safeRefundLimit = Math.min(50, Math.max(1, Math.floor(opts.refundLimit ?? 50) || 50));

  // Cap concurrent OrderHeader scans — bare Promise.all of ~10 OH queries storms SQLite.
  // Heterogeneous job returns → Promise<unknown> then cast (mapPool is order-preserving).
  type ReportParts = [
    Awaited<ReturnType<typeof queryOverview>>,
    Awaited<ReturnType<typeof queryTimeSlots>>,
    Awaited<ReturnType<typeof queryHourly>>,
    Awaited<ReturnType<typeof querySalesmanRanking>>,
    Awaited<ReturnType<typeof queryMerchantRanking>>,
    Awaited<ReturnType<typeof queryMerchantVerifyExtremes>>,
    Awaited<ReturnType<typeof querySalesmanVerifyExtremes>>,
    Awaited<ReturnType<typeof queryMerchantRefunds>>,
    Awaited<ReturnType<typeof querySalesmanRefunds>>,
    { rows: Awaited<ReturnType<typeof queryOrderDetails>>['rows']; truncated: boolean }
  ];
  const reportJobs: Array<() => Promise<unknown>> = [
    () => queryOverview(prisma, start, end),
    () => queryTimeSlots(prisma, start, end),
    () => queryHourly(prisma, start, end),
    () => querySalesmanRanking(prisma, start, end, safeRankingLimit),
    () => queryMerchantRanking(prisma, start, end, safeRankingLimit),
    () => queryMerchantVerifyExtremes(prisma, start, end, 5, 5),
    () => querySalesmanVerifyExtremes(prisma, start, end, 10, 5),
    () => queryMerchantRefunds(prisma, start, end, safeRefundLimit),
    () => querySalesmanRefunds(prisma, start, end, safeRefundLimit),
    () =>
      opts.includeDetails
        ? queryOrderDetails(prisma, start, end, safeDetailLimit)
        : Promise.resolve({ rows: [], truncated: false })
  ];
  const reportParts = (await mapPool(reportJobs, DATA_ANALYSIS_OH_CONCURRENCY, (job) =>
    job()
  )) as ReportParts;
  const [
    overview,
    timeSlots,
    hourly,
    salesmen,
    merchants,
    merchantVerify,
    salesmanVerify,
    merchantRefunds,
    salesmanRefunds,
    details
  ] = reportParts;

  const limitations: string[] = [];
  if (overview.salesmanCount === 0) {
    limitations.push(
      '业务员字段暂无数据：请跑 GMV 刷新/订单 ETL，或执行 scripts/backfill-order-salesman.ts 从导出 Excel 回填'
    );
  }
  limitations.push('订单状态文案按 status/verifyTime 映射，可能与 JeSite 原状态文案略有差异');
  limitations.push(`目标达成比固定分母 ${33000}（模板 3.3w）`);
  if (window === 'year') {
    limitations.push(
      `year 窗口为锚定日往前 ${DATA_ANALYSIS_READ_MAX_DAYS} 天（交互读上限），非整年 1/1–12/31`
    );
  }
  // Channel field is sparsely populated (JeSite upserts write "jeesite"); surface that.
  limitations.push(
    '渠道占比基于 OrderHeader.channel；JeSite 同步默认写入 jeesite，未细分微信/支付宝时会归入「其他」'
  );
  limitations.push(`指标明细矩阵锚定日：${end}（北京日历）`);

  return {
    window,
    date: start,
    endDate: end,
    generatedAt: new Date().toISOString(),
    templateReady: true,
    overview,
    timeSlots,
    hourly,
    salesmen,
    merchants,
    merchantVerifyLow: merchantVerify.low,
    merchantVerifyHigh: merchantVerify.high,
    salesmanVerifyLow: salesmanVerify.low,
    salesmanVerifyHigh: salesmanVerify.high,
    merchantRefunds,
    salesmanRefunds,
    details: details.rows,
    detailTruncated: details.truncated,
    limitations
  };
}
