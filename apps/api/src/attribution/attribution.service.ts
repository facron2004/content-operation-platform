import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManualBindDto } from './dto/manual-bind.dto';

const CHANNEL_WINDOW_HOURS: Record<string, number> = {
  wechat_group: 24,
  moments: 72,
  merchant_share: 48
};

interface TaskRow {
  taskId: string;
  trackingCode: string | null;
  packageId: string;
  channel: string;
  publishedAt: string | null;
  areaId: string | null;
}

@Injectable()
export class AttributionService {
  private readonly logger = new Logger(AttributionService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * 3-tier attribution matching for all active tasks.
   * 1. direct – match TrackingVisit.visitorId to OrderHeader.memberId
   * 2. time_window – match same packageId/areaId within channel-based window
   * 3. fallback – match remaining un-attributed orders by packageId
   */
  async recompute() {
    this.logger.log('Starting attribution recomputation...');

    const tasks = await this.prisma.$queryRawUnsafe<TaskRow[]>(
      `SELECT "taskId", "trackingCode", "packageId", "channel", "publishedAt", "areaId"
       FROM "DistributionTask"
       WHERE "status" IN ('published', 'completed')`
    );

    for (const task of tasks) {
      try {
        await this.runDirectAttribution(task);

        const hasDirect = await this.hasAttributions(task.taskId, 'direct');
        if (!hasDirect) {
          await this.runTimeWindowAttribution(task);
        }

        await this.runFallbackAttribution(task);
        await this.updatePerformance(task.taskId);
      } catch (err) {
        this.logger.warn(`Attribution failed for task ${task.taskId}: ${err}`);
      }
    }

    this.logger.log(`Attribution recomputation complete for ${tasks.length} tasks`);
    return { success: true, processedTasks: tasks.length };
  }

  /** Tier 1: Match via visitorId == memberId within attribution window. */
  private async runDirectAttribution(task: TaskRow) {
    if (!task.trackingCode || !task.publishedAt) return;

    const windowEnd = this.windowEnd(task.publishedAt, task.channel);
    const visits = await this.prisma.$queryRawUnsafe<Array<{ visitorId: string }>>(
      `SELECT DISTINCT "visitorId" FROM "TrackingVisit"
       WHERE "trackingCode" = ? AND "visitorId" IS NOT NULL`,
      task.trackingCode
    );

    for (const visit of visits) {
      const orders = await this.prisma.$queryRawUnsafe<Array<{ orderId: string }>>(
        `SELECT "orderId" FROM "OrderHeader"
         WHERE "memberId" = ? AND "orderTime" >= ? AND "orderTime" <= ?`,
        visit.visitorId,
        task.publishedAt,
        windowEnd
      );

      for (const order of orders) {
        await this.insertAttribution(task.taskId, order.orderId, 'direct', 'high');
      }
    }
  }

  /** Tier 2: Match by same packageId (and areaId if available) within window. */
  private async runTimeWindowAttribution(task: TaskRow) {
    if (!task.publishedAt) return;

    const windowEnd = this.windowEnd(task.publishedAt, task.channel);

    // Build matching condition: always match packageId, optionally areaId
    const conditions = [`oh."packageId" = ?`];
    const params: unknown[] = [task.packageId];
    if (task.areaId) {
      conditions.push(`oh."areaId" = ?`);
      params.push(task.areaId);
    }

    conditions.push(`oh."orderTime" >= ?`, `oh."orderTime" <= ?`);
    params.push(task.publishedAt, windowEnd);

    const orders = await this.prisma.$queryRawUnsafe<Array<{ orderId: string }>>(
      `SELECT oh."orderId" FROM "OrderHeader" oh
       LEFT JOIN "OrderAttribution" oa ON oh."orderId" = oa."orderId"
       WHERE ${conditions.join(' AND ')} AND oa."orderId" IS NULL`,
      ...params
    );

    for (const order of orders) {
      await this.insertAttribution(task.taskId, order.orderId, 'time_window', 'medium');
    }
  }

  /** Tier 3: Attribute remaining unmatched orders by packageId (low confidence). */
  private async runFallbackAttribution(task: TaskRow) {
    const orders = await this.prisma.$queryRawUnsafe<Array<{ orderId: string }>>(
      `SELECT oh."orderId" FROM "OrderHeader" oh
       LEFT JOIN "OrderAttribution" oa ON oh."orderId" = oa."orderId"
       WHERE oh."packageId" = ? AND oa."orderId" IS NULL`,
      task.packageId
    );

    for (const order of orders) {
      await this.insertAttribution(task.taskId, order.orderId, 'fallback', 'low');
    }
  }

  /** List orders that have not been attributed to any task. */
  async getUnmatchedOrders() {
    const orders = await this.prisma.$queryRawUnsafe<
      Array<{
        orderId: string;
        memberId: string | null;
        packageId: string | null;
        orderAmount: number;
        paidAmount: number;
        orderTime: string;
        status: string;
      }>
    >(
      `SELECT "orderId", "memberId", "packageId", "orderAmount", "paidAmount", "orderTime", "status"
       FROM "OrderHeader" oh
       WHERE NOT EXISTS (SELECT 1 FROM "OrderAttribution" oa WHERE oa."orderId" = oh."orderId")
       ORDER BY oh."orderTime" DESC`
    );
    return { items: orders };
  }

  /** Manually bind an order to a task (method='manual', confidence='high'). */
  async manualBind(dto: ManualBindDto) {
    await this.insertAttribution(dto.taskId, dto.orderId, 'manual', 'high');
    await this.updatePerformance(dto.taskId);
    return { success: true };
  }

  /** Revoke an attribution by its id. */
  async revoke(id: string) {
    await this.prisma.$executeRawUnsafe(`DELETE FROM "OrderAttribution" WHERE "id" = ?`, id);
    return { success: true };
  }

  // ─── Helpers ────────────────────────────────────────────────

  private async insertAttribution(
    taskId: string,
    orderId: string,
    method: string,
    confidence: string
  ) {
    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "OrderAttribution" ("taskId", "orderId", "method", "confidence", "createdAt")
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT("taskId", "orderId") DO NOTHING`,
        taskId,
        orderId,
        method,
        confidence,
        new Date().toISOString()
      );
    } catch (err) {
      this.logger.warn(`Failed to insert attribution (${method}) for order ${orderId}: ${err}`);
    }
  }

  private async hasAttributions(taskId: string, method: string): Promise<boolean> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
      `SELECT COUNT(*) as cnt FROM "OrderAttribution" WHERE "taskId" = ? AND "method" = ?`,
      taskId,
      method
    );
    return Number(rows[0].cnt) > 0;
  }

  private async updatePerformance(taskId: string) {
    const today = new Date().toISOString().substring(0, 10);

    // Count visits for this task today
    const visitRows = await this.prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
      `SELECT COUNT(*) as cnt FROM "TrackingVisit" tv
       INNER JOIN "DistributionTask" t ON t."trackingCode" = tv."trackingCode"
       WHERE t."taskId" = ? AND DATE(tv."createdAt") = ?`,
      taskId,
      today
    );

    // Count attributed orders and GMV
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
      today
    );

    const visits = Number(visitRows[0].cnt);
    const attr = attrRows[0];
    const orders = Number(attr.orderCount);
    const gmv = Number(attr.gmv);
    const verifyCount = Number(attr.verifyCount);
    const refundCount = Number(attr.refundCount);
    const conversionRate = visits > 0 ? orders / visits : 0;

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
      today,
      visits,
      orders,
      gmv,
      verifyCount,
      refundCount,
      conversionRate,
      now,
      now
    );
  }

  private windowEnd(publishedAt: string, channel: string): string {
    const hours = CHANNEL_WINDOW_HOURS[channel] ?? 24;
    return new Date(new Date(publishedAt).getTime() + hours * 60 * 60 * 1000).toISOString();
  }
}
