/** Assemble 砍价订单 data-analysis report + Excel buffer. */
import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { TtlCache, withHeavyAggregateGate } from '../common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  DataAnalysisOverview,
  DataAnalysisReport,
  DataAnalysisSummary,
  DataAnalysisWindow,
  DataAnalysisWindowSnapshot
} from './data-analysis.dto';
import {
  buildDeltas,
  queryChannelBreakdown,
  queryDailyTrend,
  queryOverview,
  queryPackageRanking
} from './data-analysis-query';
import { buildDataAnalysisWorkbook, buildExportFilename } from './data-analysis-excel';
import { buildDataAnalysisReport } from './data-analysis-report';
import { fixedSnapshotWindows, previousEqualWindow } from './data-analysis-window';
import {
  DATA_ANALYSIS_DETAIL_MAX_ROWS,
  DATA_ANALYSIS_OH_CONCURRENCY,
  mapPool
} from '../common/sql-chunk';

const DEFAULT_DETAIL_LIMIT = DATA_ANALYSIS_DETAIL_MAX_ROWS;
const DEFAULT_RANKING_LIMIT = 500;
/** UI summary panels only need a short top-N; Excel keeps DEFAULT_RANKING_LIMIT. */
const UI_RANKING_LIMIT = 20;
const UI_REFUND_LIMIT = 15;
const UI_PACKAGE_LIMIT = 5;

const EMPTY_OVERVIEW: DataAnalysisOverview = {
  orderCount: 0,
  salesAmount: 0,
  walletAmount: 0,
  tradeAmount: 0,
  netGmv: 0,
  writeOffAmount: 0,
  faceAmount: 0,
  refundAmount: 0,
  verifyAmount: 0,
  verifyRate: 0,
  refundRate: 0,
  refundCount: 0,
  settlementRate: 0,
  avgOrderValue: 0,
  targetRatio: 0,
  targetRatioWithWallet: 0,
  netGmvTargetRatio: 0,
  verifiedCount: 0,
  pendingVerifyCount: 0,
  expiredCount: 0,
  merchantCount: 0,
  salesmanCount: 0
};

/** Interactive summary TTL — multi-query matrix; short so ops still see fresh windows. */
const SUMMARY_TTL_MS = 30_000;

@Injectable()
export class DataAnalysisService {
  private readonly logger = new Logger(DataAnalysisService.name);
  /** Single-flight across Excel export (heavy multi-query + workbook build). */
  private exportRunning = false;
  /** TTL + in-flight coalesce for interactive summary (export remains uncached). */
  private readonly summaryCache = new TtlCache(SUMMARY_TTL_MS, 32);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getSummary(
    window: DataAnalysisWindow,
    date?: string,
    endDate?: string,
    detailLimit = DEFAULT_DETAIL_LIMIT,
    rankingLimit = DEFAULT_RANKING_LIMIT
  ): Promise<DataAnalysisSummary> {
    // Summary is a UI preview — never materialize order-detail rows just to count them.
    // Cap ranking rows for the interactive payload; Excel export uses full rankingLimit.
    const uiRanking = Math.min(
      UI_RANKING_LIMIT,
      Math.max(1, Math.floor(rankingLimit) || UI_RANKING_LIMIT)
    );
    const safeDetailLimit = Math.min(
      DATA_ANALYSIS_DETAIL_MAX_ROWS,
      Math.max(1, Math.floor(detailLimit) || DEFAULT_DETAIL_LIMIT)
    );
    const cacheKey = `da:summary:${window}:${date ?? ''}:${endDate ?? ''}:${uiRanking}:${safeDetailLimit}`;
    try {
      // Cache hits skip the gate; cold multi-OH matrix shares process-wide heavy pool.
      return await this.summaryCache.getOrLoad(cacheKey, false, () =>
        withHeavyAggregateGate(() =>
          this.buildSummary(window, date, endDate, detailLimit, uiRanking, safeDetailLimit)
        )
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'HeavyAggregateQueueFullError') {
        throw new ConflictException('数据分析计算繁忙，请稍后再试');
      }
      throw err;
    }
  }

  private async buildSummary(
    window: DataAnalysisWindow,
    date: string | undefined,
    endDate: string | undefined,
    detailLimit: number,
    uiRanking: number,
    safeDetailLimit: number
  ): Promise<DataAnalysisSummary> {
    const report = await this.buildReport(window, date, endDate, detailLimit, uiRanking, {
      includeDetails: false,
      refundLimit: UI_REFUND_LIMIT
    });
    const orderCount = report.overview.orderCount;

    // Previous equal-length window for MoM deltas.
    const prev = previousEqualWindow(report.date, report.endDate);
    // Fixed matrix windows (今日/昨日/近7/近30) anchored to the selected end day.
    const snapDefs = fixedSnapshotWindows(report.endDate);

    // Cap concurrent OrderHeader scans — bare Promise.all of ~8 OH queries storms SQLite.
    // Heterogeneous job returns → Promise<unknown> then cast (mapPool is order-preserving).
    const summaryJobs: Array<() => Promise<unknown>> = [
      () => queryOverview(this.prisma, prev.start, prev.end),
      () => queryDailyTrend(this.prisma, report.date, report.endDate),
      () => queryChannelBreakdown(this.prisma, report.date, report.endDate),
      () => queryPackageRanking(this.prisma, report.date, report.endDate, UI_PACKAGE_LIMIT),
      ...snapDefs.map((s) => () => queryOverview(this.prisma, s.start, s.end))
    ];
    const summaryParts = await mapPool(summaryJobs, DATA_ANALYSIS_OH_CONCURRENCY, (job) => job());
    const previousOverview = summaryParts[0] as Awaited<ReturnType<typeof queryOverview>>;
    const daily = summaryParts[1] as Awaited<ReturnType<typeof queryDailyTrend>>;
    const channels = summaryParts[2] as Awaited<ReturnType<typeof queryChannelBreakdown>>;
    const packages = summaryParts[3] as Awaited<ReturnType<typeof queryPackageRanking>>;
    const snapOverviews = summaryParts.slice(4) as Array<Awaited<ReturnType<typeof queryOverview>>>;

    const windowSnapshots: DataAnalysisWindowSnapshot[] = snapDefs.map((s, i) => ({
      key: s.key,
      label: s.label,
      start: s.start,
      end: s.end,
      overview: snapOverviews[i] ?? EMPTY_OVERVIEW
    }));

    // Residual #279: interactive panel caps are intentional for payload size;
    // project limits + truncated so SPA does not present Top-N as exhaustive.
    // rankingTruncated: hit UI head OR overview distinct counts exceed returned rows.
    const rankingTruncated =
      report.salesmen.length >= uiRanking ||
      report.merchants.length >= uiRanking ||
      report.overview.salesmanCount > report.salesmen.length ||
      report.overview.merchantCount > report.merchants.length;
    const refundTruncated =
      report.merchantRefunds.length >= UI_REFUND_LIMIT ||
      report.salesmanRefunds.length >= UI_REFUND_LIMIT;
    const packageTruncated = packages.length >= UI_PACKAGE_LIMIT;

    return {
      window: report.window,
      date: report.date,
      endDate: report.endDate,
      previousStart: prev.start,
      previousEnd: prev.end,
      templateReady: report.templateReady,
      overview: report.overview,
      previousOverview,
      deltas: buildDeltas(report.overview, previousOverview),
      daily,
      channels,
      packages,
      windowSnapshots,
      merchantCount: report.overview.merchantCount,
      salesmanCount: report.overview.salesmanCount,
      detailCount: Math.min(orderCount, safeDetailLimit),
      detailTruncated: orderCount > safeDetailLimit,
      // Residual #279
      rankingLimit: uiRanking,
      rankingTruncated,
      refundLimit: UI_REFUND_LIMIT,
      refundTruncated,
      packageLimit: UI_PACKAGE_LIMIT,
      packageTruncated,
      limitations: report.limitations,
      sheets: [
        { key: 'overview', title: '总览', status: 'ready' },
        { key: 'time', title: '时段分布', status: 'ready' },
        {
          key: 'salesman',
          title: '业务员排行',
          status: report.salesmen.length ? 'ready' : 'placeholder'
        },
        { key: 'merchant', title: '商家排行', status: 'ready' },
        { key: 'verify', title: '核销率分析', status: 'ready' },
        { key: 'refund', title: '退款分析', status: 'ready' },
        { key: 'detail', title: '订单明细', status: 'ready' }
      ],
      timeSlots: report.timeSlots,
      hourly: report.hourly,
      salesmen: report.salesmen,
      merchants: report.merchants,
      merchantVerifyLow: report.merchantVerifyLow,
      merchantVerifyHigh: report.merchantVerifyHigh,
      salesmanVerifyLow: report.salesmanVerifyLow,
      salesmanVerifyHigh: report.salesmanVerifyHigh,
      merchantRefunds: report.merchantRefunds,
      salesmanRefunds: report.salesmanRefunds
    };
  }

  async exportExcel(
    window: DataAnalysisWindow,
    date?: string,
    endDate?: string,
    detailLimit = DEFAULT_DETAIL_LIMIT,
    rankingLimit = DEFAULT_RANKING_LIMIT
  ): Promise<{ buffer: Buffer; filename: string }> {
    if (this.exportRunning) {
      this.logger.warn('Skipping data-analysis export — previous run still in flight');
      throw new ConflictException('数据分析导出进行中，请稍后再试');
    }
    this.exportRunning = true;
    try {
      // exportRunning single-flights Excel; heavy gate still bounds vs list aggregates.
      const report = await withHeavyAggregateGate(() =>
        this.buildReport(window, date, endDate, detailLimit, rankingLimit, {
          includeDetails: true
        })
      );
      const buffer = await buildDataAnalysisWorkbook(report);
      return { buffer, filename: buildExportFilename(report) };
    } catch (err) {
      if (err instanceof Error && err.name === 'HeavyAggregateQueueFullError') {
        throw new ConflictException('数据分析导出繁忙，请稍后再试');
      }
      throw err;
    } finally {
      this.exportRunning = false;
    }
  }

  private async buildReport(
    window: DataAnalysisWindow,
    date?: string,
    endDate?: string,
    detailLimit = DEFAULT_DETAIL_LIMIT,
    rankingLimit = DEFAULT_RANKING_LIMIT,
    opts: { includeDetails: boolean; refundLimit?: number } = { includeDetails: true }
  ): Promise<DataAnalysisReport> {
    return buildDataAnalysisReport(
      this.prisma,
      window,
      date,
      endDate,
      detailLimit,
      rankingLimit,
      opts
    );
  }
}
