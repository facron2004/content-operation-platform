import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PerformanceAggregationJob {
  private readonly logger = new Logger(PerformanceAggregationJob.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Run every hour.
   * Aggregate visits, attributed orders, and GMV for all published/completed tasks,
   * then upsert into TaskPerformanceDaily.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async aggregatePerformance() {
    this.logger.log('Aggregating task performance...');
    const today = new Date().toISOString().substring(0, 10);

    try {
      const tasks = await this.prisma.$queryRawUnsafe<
        Array<{ taskId: string; trackingCode: string | null }>
      >(
        `SELECT "taskId", "trackingCode" FROM "DistributionTask"
         WHERE "status" IN ('published', 'completed')`
      );

      let updated = 0;
      for (const task of tasks) {
        try {
          await this.upsertDailyPerformance(task.taskId, task.trackingCode, today);
          updated++;
        } catch (err) {
          this.logger.warn(`Performance aggregation failed for task ${task.taskId}: ${err}`);
        }
      }

      this.logger.log(`Upserted performance for ${updated}/${tasks.length} tasks`);
    } catch (err) {
      this.logger.warn(`Failed to aggregate performance: ${err}`);
    }
  }

  private async upsertDailyPerformance(taskId: string, trackingCode: string | null, date: string) {
    // Count visits for this task today
    let visitCount = 0;
    if (trackingCode) {
      const visitRows = await this.prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
        `SELECT COUNT(*) as cnt FROM "TrackingVisit"
         WHERE "trackingCode" = ? AND DATE("createdAt") = ?`,
        trackingCode,
        date
      );
      visitCount = Number(visitRows[0].cnt);
    }

    // Count attributed orders, GMV, verify, refund
    const attrRows = await this.prisma.$queryRawUnsafe<
      Array<{
        orderCount: number;
        gmv: number;
        verifyCount: number;
        refundCount: number;
      }>
    >(
      `SELECT
         COUNT(DISTINCT oa."orderId") as orderCount,
         COALESCE(SUM(oh."paidAmount" + oh."paidAmountWallet"), 0) as gmv,
         COALESCE(SUM(CASE WHEN oh."verifyTime" IS NOT NULL THEN 1 ELSE 0 END), 0) as verifyCount,
         COALESCE(SUM(CASE WHEN oh."refundAmount" > 0 THEN 1 ELSE 0 END), 0) as refundCount
       FROM "OrderAttribution" oa
       INNER JOIN "OrderHeader" oh ON oh."orderId" = oa."orderId"
       WHERE oa."taskId" = ? AND DATE(oa."createdAt") = ?`,
      taskId,
      date
    );

    const attr = attrRows[0];
    const orders = Number(attr.orderCount);
    const gmv = Number(attr.gmv);
    const verifyCount = Number(attr.verifyCount);
    const refundCount = Number(attr.refundCount);
    const conversionRate = visitCount > 0 ? orders / visitCount : 0;

    const now = new Date().toISOString();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "TaskPerformanceDaily" ("taskId", "date", "visitCount", "orderCount", "gmv", "verifyCount", "refundCount", "conversionRate", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT("taskId", "date") DO UPDATE SET
         "visitCount" = excluded."visitCount",
         "orderCount" = excluded."orderCount",
         "gmv" = excluded."gmv",
         "verifyCount" = excluded."verifyCount",
         "refundCount" = excluded."refundCount",
         "conversionRate" = excluded."conversionRate",
         "updatedAt" = excluded."updatedAt"`,
      taskId,
      date,
      visitCount,
      orders,
      gmv,
      verifyCount,
      refundCount,
      conversionRate,
      now,
      now
    );
  }
}
