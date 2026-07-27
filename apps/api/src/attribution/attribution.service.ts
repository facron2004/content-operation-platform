import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { beijingDateKey, shiftDateKey } from '@content/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ManualBindDto } from './dto/manual-bind.dto';
import { newEntityId } from '../common/id';
import { SQL_GMV_OH } from '../common/gmv-math';
import {
  beijingDayRangeSqlite,
  sqlBeijingDate,
  sqlDatetime,
  sqlDatetimeExclusiveRange,
  toSqliteDateTime
} from '../common/sqlite-datetime';
import {
  ATTRIBUTION_MISMATCH_PURGE_LIMIT,
  ATTRIBUTION_ORDER_DIRECT_LIMIT,
  ATTRIBUTION_ORDER_WINDOW_LIMIT,
  ATTRIBUTION_VISIT_FANOUT_LIMIT,
  DEFAULT_IN_CHUNK,
  clampListPage,
  clampListPageSize,
  PERF_JOB_TASK_LIMIT,
  queryInChunks
} from '../common/sql-chunk';
import { withHeavyAggregateGate } from '../common';
import { safePathId } from '../common/path-id';
import { channelWindowEnd } from '../common/channel-window';
import { INTERACTIVE_LIST_MAX_DAYS } from '../common/list-date-span';
import { bulkRefreshTaskPerformanceDaily } from '../common/task-performance-daily';

/** Mask memberId for list responses (keep last 4 chars). */
function maskMemberId(memberId: string | null | undefined): string | null {
  if (!memberId) return null;
  const s = String(memberId);
  if (s.length <= 4) return '****';
  return `${'*'.repeat(Math.min(12, s.length - 4))}${s.slice(-4)}`;
}

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
  // Single-flight: concurrent recompute tabs must not double-scan OrderHeader.
  private recomputeInFlight: Promise<{ success: true; processedTasks: number }> | null = null;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * 3-tier attribution matching for all active tasks.
   * 1. direct – visitorId==memberId + same packageId within channel window
   * 2. time_window – same packageId/areaId within channel-based window
   * 3. fallback – remaining un-attributed orders by packageId (same window)
   * One order may only belong to one task (unique orderId + insert guard).
   */
  recompute() {
    if (this.recomputeInFlight) return this.recomputeInFlight;
    const run = this.runRecompute().finally(() => {
      this.recomputeInFlight = null;
    });
    this.recomputeInFlight = run;
    return run;
  }

  private async runRecompute() {
    this.logger.log('Starting attribution recomputation...');

    // Serialize against other heavy money/list aggregates — admin recompute can
    // otherwise monopolize SQLite for the full task×visitor window.
    try {
      return await withHeavyAggregateGate(async () => {
        // OrderHeader re-ETL can rewrite packageId under an existing OA row. Drop
        // package-mismatched attributions first so tiers re-bind cleanly and TPD
        // historical days lose the ghost GMV.
        await this.purgePackageMismatchedAttributions();

        // areaId lives on CommunityGroup / ContentPackage, not DistributionTask.
        // Hard-cap fan-out (recent first) — full catalog recompute is O(tasks × visitors).
        // Prefer package geography for money matching — community area reassignment
        // must not retarget attribution windows onto a different area.
        const tasks = await this.prisma.$queryRawUnsafe<TaskRow[]>(
          `SELECT t."taskId", t."trackingCode", t."packageId", t."channel", t."publishedAt",
                  COALESCE(p."areaId", g."areaId") AS "areaId"
           FROM "DistributionTask" t
           LEFT JOIN "CommunityGroup" g ON g."groupId" = t."groupId"
           LEFT JOIN "ContentPackage" p ON p."packageId" = t."packageId"
           WHERE t."status" IN ('published', 'completed')
           ORDER BY t."updatedAt" DESC
           LIMIT ?`,
          PERF_JOB_TASK_LIMIT
        );

        // Recompute only inserts new OA rows (attributedAt=now) — refresh today
        // once via bulk TPD after all tiers, not N× updatePerformance (residual #87).
        // Residual #89: run all direct first, then one bulk hasDirect probe, then
        // time_window only for tasks without direct — not N× COUNT under the gate.
        const tpdTasks: Array<{ taskId: string; trackingCode: string | null }> = [];
        const okTaskIds = new Set<string>();
        for (const task of tasks) {
          try {
            await this.runDirectAttribution(task);
            tpdTasks.push({ taskId: task.taskId, trackingCode: task.trackingCode });
            okTaskIds.add(task.taskId);
          } catch (err) {
            this.logger.warn(`Attribution (direct) failed for task ${task.taskId}: ${err}`);
          }
        }

        const withDirect = await this.loadTaskIdsWithMethod([...okTaskIds], 'direct');

        for (const task of tasks) {
          // Only continue tiers for tasks that survived the direct pass.
          if (!okTaskIds.has(task.taskId)) continue;
          try {
            if (!withDirect.has(task.taskId)) {
              await this.runTimeWindowAttribution(task);
            }
            await this.runFallbackAttribution(task);
          } catch (err) {
            this.logger.warn(
              `Attribution (window/fallback) failed for task ${task.taskId}: ${err}`
            );
          }
        }

        if (tpdTasks.length) {
          try {
            const today = beijingDateKey(new Date());
            await bulkRefreshTaskPerformanceDaily(this.prisma, tpdTasks, today);
          } catch (err) {
            this.logger.warn(`Bulk TPD refresh after attribution recompute failed: ${err}`);
          }
        }

        this.logger.log(`Attribution recomputation complete for ${tasks.length} tasks`);
        return { success: true as const, processedTasks: tasks.length };
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'HeavyAggregateQueueFullError') {
        this.logger.warn('Attribution recompute skipped — heavy aggregate queue full');
        return { success: true as const, processedTasks: 0 };
      }
      throw err;
    }
  }

  /**
   * Drop OA rows whose order packageId no longer matches the bound task.
   * OrderHeader upsert overwrites packageId on re-ETL; without this, sticky OA
   * keeps GMV on the wrong task forever (recompute only inserts unmatched rows).
   */
  private async purgePackageMismatchedAttributions() {
    const mismatched = await this.prisma.$queryRawUnsafe<
      Array<{ attributionId: string; taskId: string; day: string; trackingCode: string | null }>
    >(
      `SELECT oa."attributionId", oa."taskId", ${sqlBeijingDate('oa."attributedAt"')} as day,
              t."trackingCode" as "trackingCode"
       FROM "OrderAttribution" oa
       INNER JOIN "OrderHeader" oh ON oh."orderId" = oa."orderId"
       INNER JOIN "DistributionTask" t ON t."taskId" = oa."taskId"
       WHERE oh."packageId" IS NULL
          OR TRIM(oh."packageId") = ''
          OR oh."packageId" <> t."packageId"
       LIMIT ?`,
      ATTRIBUTION_MISMATCH_PURGE_LIMIT
    );
    if (!mismatched.length) return;

    const ids = mismatched.map((r) => r.attributionId);
    // Chunk DELETE — SQLite param limit and safer partial progress.
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const placeholders = chunk.map(() => '?').join(',');
      await this.prisma.$executeRawUnsafe(
        `DELETE FROM "OrderAttribution" WHERE "attributionId" IN (${placeholders})`,
        ...chunk
      );
    }

    // Recompute TPD for (taskId, day) pairs that lost rows — group by day and
    // bulk-refresh (residual #87; was N× updatePerformance serial).
    const byDay = new Map<string, Map<string, string | null>>();
    for (const row of mismatched) {
      if (!row.taskId || !row.day) continue;
      if (!byDay.has(row.day)) byDay.set(row.day, new Map());
      byDay.get(row.day)!.set(row.taskId, row.trackingCode ?? null);
    }
    for (const [day, tasks] of byDay) {
      try {
        await bulkRefreshTaskPerformanceDaily(
          this.prisma,
          [...tasks.entries()].map(([taskId, trackingCode]) => ({ taskId, trackingCode })),
          day
        );
      } catch (err) {
        this.logger.warn(
          `Failed to bulk-refresh TPD after package-mismatch purge for day ${day}: ${err}`
        );
      }
    }
    this.logger.log(`Purged ${mismatched.length} package-mismatched OrderAttribution row(s)`);
  }

  /** Tier 1: Match via visitorId == memberId within attribution window. */
  private async runDirectAttribution(task: TaskRow) {
    if (!task.trackingCode || !task.publishedAt) return;

    const windowEnd = this.windowEnd(task.publishedAt, task.channel);
    const windowStart = toSqliteDateTime(task.publishedAt);
    // Cap distinct visitors per task + pin visitTime to the same channel window
    // as order matching. Historical spam outside the attribution window must not
    // expand recompute fan-out (LIMIT alone still scans + DISTINCT-sorts them).
    const visits = await this.prisma.$queryRawUnsafe<Array<{ visitorId: string }>>(
      `SELECT DISTINCT "visitorId" FROM "TrackingVisit"
       WHERE "trackingCode" = ?
         AND "visitorId" IS NOT NULL
         AND ${sqlDatetime('"visitTime"')} >= datetime(?)
         AND ${sqlDatetime('"visitTime"')} <= datetime(?)
       LIMIT ?`,
      task.trackingCode,
      windowStart,
      windowEnd,
      ATTRIBUTION_VISIT_FANOUT_LIMIT
    );
    const visitorIds = [
      ...new Set(visits.map((v) => String(v.visitorId ?? '').trim()).filter(Boolean))
    ];
    if (!visitorIds.length) return;

    // Batch memberId IN (chunked) — previous N×1 OH queries stormed SQLite under
    // multi-visitor tasks (up to ATTRIBUTION_VISIT_FANOUT_LIMIT sequential scans).
    // Per-chunk LIMIT keeps fan-out bounded; insertAttributions de-dupes via NOT EXISTS.
    const orderRows = await queryInChunks(
      visitorIds,
      async (chunk) => {
        const ph = chunk.map(() => '?').join(',');
        // Param order: memberIds…, packageId, windowStart, windowEnd, limit.
        return (await this.prisma.$queryRawUnsafe(
          `SELECT oh."orderId" FROM "OrderHeader" oh
           LEFT JOIN "OrderAttribution" oa ON oh."orderId" = oa."orderId"
           WHERE oh."memberId" IN (${ph})
             AND oh."packageId" = ?
             AND (${SQL_GMV_OH}) > 0
             AND ${sqlDatetime('oh."orderTime"')} >= datetime(?)
             AND ${sqlDatetime('oh."orderTime"')} <= datetime(?)
             AND oa."orderId" IS NULL
           LIMIT ?`,
          ...chunk,
          task.packageId,
          windowStart,
          windowEnd,
          // Per-chunk ceiling — total inserts still guarded by insertAttributions + UNIQUE.
          Math.min(ATTRIBUTION_ORDER_DIRECT_LIMIT * chunk.length, ATTRIBUTION_ORDER_WINDOW_LIMIT)
        )) as Array<{ orderId: string }>;
      },
      DEFAULT_IN_CHUNK
    );

    const orderIds = [...new Set(orderRows.map((o) => o.orderId).filter(Boolean))];
    await this.insertAttributions(task.taskId, orderIds, 'direct', 'high');
  }

  /** Tier 2: Match by same packageId (and areaId if available) within window. */
  private async runTimeWindowAttribution(task: TaskRow) {
    if (!task.publishedAt) return;

    const windowEnd = this.windowEnd(task.publishedAt, task.channel);
    const windowStart = toSqliteDateTime(task.publishedAt);

    // Build matching condition: always match packageId, optionally areaId
    const conditions = [`oh."packageId" = ?`];
    const params: unknown[] = [task.packageId];
    if (task.areaId) {
      conditions.push(`oh."areaId" = ?`);
      params.push(task.areaId);
    }

    conditions.push(
      `${sqlDatetime('oh."orderTime"')} >= datetime(?)`,
      `${sqlDatetime('oh."orderTime"')} <= datetime(?)`
    );
    params.push(windowStart, windowEnd);

    // Paid-only: zero-pay rows would still inflate orderCount / conversionRate.
    conditions.push(`(${SQL_GMV_OH}) > 0`);
    const orders = await this.prisma.$queryRawUnsafe<Array<{ orderId: string }>>(
      `SELECT oh."orderId" FROM "OrderHeader" oh
       LEFT JOIN "OrderAttribution" oa ON oh."orderId" = oa."orderId"
       WHERE ${conditions.join(' AND ')} AND oa."orderId" IS NULL
       LIMIT ?`,
      ...params,
      ATTRIBUTION_ORDER_WINDOW_LIMIT
    );

    await this.insertAttributions(
      task.taskId,
      orders.map((o) => o.orderId),
      'time_window',
      'medium'
    );
  }

  /**
   * Tier 3: Attribute remaining unmatched orders by packageId (low confidence).
   * Bound to the same channel window as tier-2 so a new task cannot claim historical GMV.
   */
  private async runFallbackAttribution(task: TaskRow) {
    if (!task.publishedAt) return;

    const windowEnd = this.windowEnd(task.publishedAt, task.channel);
    const windowStart = toSqliteDateTime(task.publishedAt);
    const orders = await this.prisma.$queryRawUnsafe<Array<{ orderId: string }>>(
      `SELECT oh."orderId" FROM "OrderHeader" oh
       LEFT JOIN "OrderAttribution" oa ON oh."orderId" = oa."orderId"
       WHERE oh."packageId" = ?
         AND (${SQL_GMV_OH}) > 0
         AND oa."orderId" IS NULL
         AND ${sqlDatetime('oh."orderTime"')} >= datetime(?)
         AND ${sqlDatetime('oh."orderTime"')} <= datetime(?)
       LIMIT ?`,
      task.packageId,
      windowStart,
      windowEnd,
      ATTRIBUTION_ORDER_WINDOW_LIMIT
    );

    await this.insertAttributions(
      task.taskId,
      orders.map((o) => o.orderId),
      'fallback',
      'low'
    );
  }

  /**
   * List orders that have not been attributed to any task.
   * Always paginated + trailing 90d on orderTime — full-history COUNT + NOT EXISTS
   * over OrderHeader is a SQLite pin vector as rows accumulate.
   */
  async getUnmatchedOrders(page = 1, pageSize = 20) {
    // Defense-in-depth: DTO Max may be bypassed if pipe is misconfigured.
    const safePage = clampListPage(page, 100);
    const safePageSize = clampListPageSize(pageSize);
    const offset = (safePage - 1) * safePageSize;
    const dateTo = beijingDateKey(new Date());
    const dateFrom = shiftDateKey(dateTo, -(INTERACTIVE_LIST_MAX_DAYS - 1));
    const orderStart = beijingDayRangeSqlite(dateFrom).start;
    const orderEnd = beijingDayRangeSqlite(dateTo).end;

    const countRows = await this.prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
      `SELECT COUNT(*) as cnt FROM "OrderHeader" oh
       WHERE NOT EXISTS (SELECT 1 FROM "OrderAttribution" oa WHERE oa."orderId" = oh."orderId")
         AND ${sqlDatetimeExclusiveRange('oh."orderTime"')}`,
      orderStart,
      orderEnd
    );
    const total = Number(countRows[0]?.cnt ?? 0);

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
         AND ${sqlDatetimeExclusiveRange('oh."orderTime"')}
       ORDER BY ${sqlDatetime('oh."orderTime"')} DESC
       LIMIT ? OFFSET ?`,
      orderStart,
      orderEnd,
      safePageSize,
      offset
    );
    return {
      items: orders.map((o) => ({
        ...o,
        // memberId is end-user correlation data — show last-4 only on list responses.
        memberId: maskMemberId(o.memberId)
      })),
      total,
      page: safePage,
      pageSize: safePageSize,
      dateFrom,
      dateTo
    };
  }

  /** Manually bind an order to a task (method='manual', confidence='high'). */
  async manualBind(dto: ManualBindDto) {
    const taskId = safePathId(dto.taskId);
    const orderId = safePathId(dto.orderId);
    if (!taskId || !orderId) throw new NotFoundException('任务或订单不存在');
    const tasks = await this.prisma.$queryRawUnsafe<
      Array<{
        taskId: string;
        packageId: string;
        status: string;
        channel: string | null;
        publishedAt: string | null;
      }>
    >(
      `SELECT "taskId", "packageId", "status", "channel", "publishedAt"
       FROM "DistributionTask" WHERE "taskId" = ? LIMIT 1`,
      taskId
    );
    if (!tasks.length) throw new NotFoundException('任务不存在');
    const task = tasks[0];
    // Manual bind is for published/completed KPI correction — not draft short links.
    if (task.status !== 'published' && task.status !== 'completed') {
      throw new BadRequestException(
        `只能绑定到 published/completed 任务（当前状态: ${task.status}）`
      );
    }
    if (!task.publishedAt) {
      throw new BadRequestException('任务缺少 publishedAt，无法校验归因窗口');
    }
    const orders = await this.prisma.$queryRawUnsafe<
      Array<{
        orderId: string;
        packageId: string | null;
        orderTime: string | null;
        paidAmount: number | null;
        paidAmountWallet: number | null;
      }>
    >(
      `SELECT "orderId", "packageId", "orderTime", "paidAmount", "paidAmountWallet"
       FROM "OrderHeader" WHERE "orderId" = ? LIMIT 1`,
      orderId
    );
    if (!orders.length) throw new NotFoundException('订单不存在');
    const order = orders[0];
    // Null/empty packageId would skip the match and launder unmatched GMV onto any task.
    if (!order.packageId || !String(order.packageId).trim()) {
      throw new BadRequestException('订单缺少 packageId，无法绑定到任务');
    }
    // Cross-package bind would steal GMV onto the wrong package KPI board.
    if (task.packageId && String(order.packageId) !== String(task.packageId)) {
      throw new BadRequestException(
        `订单 packageId=${order.packageId} 与任务 packageId=${task.packageId} 不一致`
      );
    }
    // Zero-pay / unpaid rows inflate conversion without contributing GMV — refuse.
    const paid = Number(order.paidAmount ?? 0) + Number(order.paidAmountWallet ?? 0);
    if (!(paid > 0)) {
      throw new BadRequestException('订单实付金额为 0，无法绑定到任务');
    }
    // Manual must respect the same channel window as automated tiers — otherwise
    // operators can launder pre-publish / multi-year GMV onto a live task board.
    if (!order.orderTime) {
      throw new BadRequestException('订单缺少 orderTime，无法校验归因窗口');
    }
    const orderMs = new Date(order.orderTime).getTime();
    const publishMs = new Date(task.publishedAt).getTime();
    const windowEndMs = new Date(channelWindowEnd(task.publishedAt, task.channel)).getTime();
    if (
      !Number.isFinite(orderMs) ||
      !Number.isFinite(publishMs) ||
      !Number.isFinite(windowEndMs) ||
      orderMs < publishMs ||
      orderMs > windowEndMs
    ) {
      throw new BadRequestException(
        `订单时间不在任务渠道归因窗口内（${toSqliteDateTime(task.publishedAt)} ~ ${channelWindowEnd(task.publishedAt, task.channel)}）`
      );
    }
    // Capture prior owners + Beijing day so historical TPD is recomputed (not only today).
    const prior = await this.prisma.$queryRawUnsafe<Array<{ taskId: string; day: string }>>(
      `SELECT "taskId", ${sqlBeijingDate('"attributedAt"')} as day
       FROM "OrderAttribution" WHERE "orderId" = ?`,
      orderId
    );
    // One order → one task. Wipe + insert in one transaction so recompute cannot
    // re-bind between statements and leave the order unbound.
    const now = toSqliteDateTime();
    const run = async (tx: {
      $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
    }) => {
      await tx.$executeRawUnsafe(`DELETE FROM "OrderAttribution" WHERE "orderId" = ?`, orderId);
      await tx.$executeRawUnsafe(
        `INSERT INTO "OrderAttribution" ("attributionId", "taskId", "orderId", "method", "confidence", "attributedAt", "createdAt")
         VALUES (?, ?, ?, 'manual', 'high', ?, ?)`,
        newEntityId('attr'),
        taskId,
        orderId,
        now,
        now
      );
    };
    if (typeof (this.prisma as { $transaction?: unknown }).$transaction === 'function') {
      await (
        this.prisma as {
          $transaction: <T>(
            fn: (tx: {
              $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
            }) => Promise<T>
          ) => Promise<T>;
        }
      ).$transaction((tx) => run(tx));
    } else {
      await run(this.prisma);
    }
    // Refresh prior OA days (ghost GMV) + today for the new owner (rebind stamp).
    // Residual #92: day-grouped bulk TPD (was N× updatePerformance serial).
    const today = beijingDateKey(new Date());
    const refresh = new Map<string, Set<string>>();
    const addDay = (tid: string, day: string) => {
      if (!tid || !day) return;
      if (!refresh.has(tid)) refresh.set(tid, new Set());
      refresh.get(tid)!.add(day);
    };
    for (const row of prior) addDay(row.taskId, row.day);
    addDay(taskId, today);
    await this.refreshTpdByTaskDays(refresh);
    return { success: true };
  }

  /** Revoke an attribution by its attributionId. */
  async revoke(id: string) {
    const attributionId = safePathId(id);
    if (!attributionId) throw new NotFoundException('归因记录不存在');
    // Capture taskId + Beijing day before delete — today-only refresh leaves historical TPD ghosts.
    const prior = await this.prisma.$queryRawUnsafe<Array<{ taskId: string; day: string }>>(
      `SELECT "taskId", ${sqlBeijingDate('"attributedAt"')} as day
       FROM "OrderAttribution" WHERE "attributionId" = ? LIMIT 1`,
      attributionId
    );
    if (!prior.length) throw new NotFoundException('归因记录不存在');
    const taskId = prior[0].taskId;
    const day = prior[0].day;

    const result = await this.prisma.$executeRawUnsafe(
      `DELETE FROM "OrderAttribution" WHERE "attributionId" = ?`,
      attributionId
    );
    const deleted = Number(result ?? 0);
    if (deleted <= 0) throw new NotFoundException('归因记录不存在');

    // Residual #92: bulk TPD path (size-1 still avoids dedicated dual-scan helper).
    const refresh = new Map<string, Set<string>>([[taskId, new Set([day])]]);
    await this.refreshTpdByTaskDays(refresh);
    return { success: true, deleted };
  }

  // ─── Helpers ────────────────────────────────────────────────

  /**
   * Batch-insert automated tier attributions (one SQL per chunk).
   * Replaces per-order sequential INSERT which was O(orders) write chatter
   * under recompute (tasks × visitors × orders).
   */
  private async insertAttributions(
    taskId: string,
    orderIds: string[],
    method: string,
    confidence: string
  ) {
    if (!orderIds.length) return;
    // De-dupe within the batch — visitor fan-out can surface the same order twice.
    const unique = [...new Set(orderIds.filter(Boolean))];
    const now = toSqliteDateTime();
    // Keep chunks small so SQLite param count + statement size stay bounded.
    // SQLite (this build) rejects `FROM (VALUES …)` table constructors — use UNION ALL.
    const CHUNK = 100;
    for (let i = 0; i < unique.length; i += CHUNK) {
      const chunk = unique.slice(i, i + CHUNK);
      const selects = chunk
        .map((_, idx) =>
          idx === 0 ? `SELECT ? AS "attributionId", ? AS "orderId"` : `SELECT ?, ?`
        )
        .join(' UNION ALL ');
      // Param order follows statement text left→right: SELECT constants first,
      // then UNION ALL row pairs (attrId, orderId)*.
      const params: unknown[] = [taskId, method, confidence, now, now];
      for (const orderId of chunk) {
        params.push(newEntityId('attr'), orderId);
      }
      try {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO "OrderAttribution" ("attributionId", "taskId", "orderId", "method", "confidence", "attributedAt", "createdAt")
           SELECT v."attributionId", ?, v."orderId", ?, ?, ?, ?
           FROM (${selects}) AS v
           WHERE NOT EXISTS (
             SELECT 1 FROM "OrderAttribution" WHERE "orderId" = v."orderId"
           )`,
          ...params
        );
      } catch (err) {
        // Residual #96: UNIQUE → binary-split (not N serial). Residual #102: non-UNIQUE
        // failures (busy/lock/transient) also binary-split so a 100-row chunk never
        // becomes 100 serial writes under recompute storm. Size-1 falls to single-row
        // insertAttribution (UNIQUE → skip; manual rethrows; other → warn).
        const msg = err instanceof Error ? err.message : String(err);
        const isUnique = /UNIQUE|unique constraint|SQLITE_CONSTRAINT/i.test(msg);
        if (chunk.length <= 1) {
          if (isUnique) continue;
          this.logger.warn(
            `Failed batch attribution (${method}) for task ${taskId} chunk@${i}: ${err}`
          );
          await this.insertAttribution(taskId, chunk[0], method, confidence);
          continue;
        }
        if (!isUnique) {
          this.logger.warn(
            `Failed batch attribution (${method}) for task ${taskId} chunk@${i}: ${err}`
          );
        }
        const mid = Math.ceil(chunk.length / 2);
        await this.insertAttributions(taskId, chunk.slice(0, mid), method, confidence);
        await this.insertAttributions(taskId, chunk.slice(mid), method, confidence);
      }
    }
  }

  private async insertAttribution(
    taskId: string,
    orderId: string,
    method: string,
    confidence: string
  ) {
    try {
      // Atomic one-order-one-task insert. Prefer unique(orderId) when present;
      // the NOT EXISTS clause still races under concurrent writers if the unique
      // index is missing, so boot migrate + seed enforce the unique index hard.
      const now = toSqliteDateTime();
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "OrderAttribution" ("attributionId", "taskId", "orderId", "method", "confidence", "attributedAt", "createdAt")
         SELECT ?, ?, ?, ?, ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM "OrderAttribution" WHERE "orderId" = ?
         )`,
        newEntityId('attr'),
        taskId,
        orderId,
        method,
        confidence,
        now,
        now,
        orderId
      );
    } catch (err) {
      // UNIQUE(orderId) / UNIQUE(taskId, orderId) races are expected under concurrent
      // recompute — treat as already-attributed and continue for automated tiers.
      const msg = err instanceof Error ? err.message : String(err);
      if (/UNIQUE|unique constraint|SQLITE_CONSTRAINT/i.test(msg)) {
        if (method === 'manual') throw err;
        return;
      }
      // Manual binds should surface failures; automated tiers stay best-effort.
      if (method === 'manual') throw err;
      this.logger.warn(`Failed to insert attribution (${method}) for order ${orderId}: ${err}`);
    }
  }

  /**
   * Bulk probe: which of `taskIds` already have ≥1 OrderAttribution with `method`.
   * Residual #89 — replaces N× per-task COUNT under recompute heavy gate.
   * Residual #99 — single-row hasAttributions helper removed (no remaining callers).
   */
  private async loadTaskIdsWithMethod(taskIds: string[], method: string): Promise<Set<string>> {
    const out = new Set<string>();
    const ids = [...new Set(taskIds.filter(Boolean))];
    if (!ids.length) return out;
    const rows = await queryInChunks(ids, (chunk) =>
      this.prisma.$queryRawUnsafe<Array<{ taskId: string }>>(
        `SELECT DISTINCT "taskId" FROM "OrderAttribution"
         WHERE "method" = ?
           AND "taskId" IN (${chunk.map(() => '?').join(',')})`,
        method,
        ...chunk
      )
    );
    for (const r of rows) {
      if (r.taskId) out.add(String(r.taskId));
    }
    return out;
  }

  /**
   * Group (taskId → days) refresh pairs by day and bulk-refresh TPD
   * (residual #92; was N× updatePerformance serial in manualBind/revoke).
   * Loads trackingCode once for all tasks so visit counts stay correct.
   */
  private async refreshTpdByTaskDays(refresh: Map<string, Set<string>>): Promise<void> {
    if (!refresh.size) return;
    const taskIds = [...refresh.keys()].filter(Boolean);
    if (!taskIds.length) return;

    const codeByTask = new Map<string, string | null>();
    const codeRows = await queryInChunks(taskIds, (chunk) =>
      this.prisma.$queryRawUnsafe<Array<{ taskId: string; trackingCode: string | null }>>(
        `SELECT "taskId", "trackingCode" FROM "DistributionTask"
         WHERE "taskId" IN (${chunk.map(() => '?').join(',')})`,
        ...chunk
      )
    );
    for (const row of codeRows) {
      codeByTask.set(String(row.taskId), row.trackingCode ?? null);
    }

    const byDay = new Map<string, Map<string, string | null>>();
    for (const [tid, days] of refresh) {
      if (!tid) continue;
      const trackingCode = codeByTask.get(tid) ?? null;
      for (const day of days) {
        if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
        if (!byDay.has(day)) byDay.set(day, new Map());
        byDay.get(day)!.set(tid, trackingCode);
      }
    }

    for (const [day, tasks] of byDay) {
      try {
        await bulkRefreshTaskPerformanceDaily(
          this.prisma,
          [...tasks.entries()].map(([taskId, trackingCode]) => ({
            taskId,
            trackingCode
          })),
          day
        );
      } catch (err) {
        this.logger.warn(
          `Failed to bulk-refresh TPD for day ${day} (${tasks.size} task(s)): ${err}`
        );
      }
    }
  }

  // Residual #102: dead updatePerformance thin wrapper removed — all call sites
  // already use refreshTpdByTaskDays / bulkRefreshTaskPerformanceDaily.

  private windowEnd(publishedAt: string, channel: string): string {
    return channelWindowEnd(publishedAt, channel);
  }
}
