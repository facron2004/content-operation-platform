import { Inject, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DistributionExecutionService } from './distribution-execution.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskQueryDto } from './dto/task-query.dto';
import { PublishTaskDto } from './dto/publish-task.dto';
import { FailTaskDto } from './dto/fail-task.dto';

interface TaskRow {
  taskId: string;
  campaignId: string | null;
  contentId: string | null;
  groupId: string | null;
  packageId: string;
  channel: string;
  title: string | null;
  body: string | null;
  cta: string | null;
  trackingCode: string | null;
  status: string;
  priority: string;
  plannedAt: string | null;
  publishedAt: string | null;
  completedAt: string | null;
  cancelReason: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  riskLevel: string | null;
  fallbackPackageId: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

function parseTask(row: TaskRow) {
  return {
    ...row,
    campaignId: row.campaignId ?? undefined,
    contentId: row.contentId ?? undefined,
    groupId: row.groupId ?? undefined,
    title: row.title ?? undefined,
    body: row.body ?? undefined,
    cta: row.cta ?? undefined,
    trackingCode: row.trackingCode ?? undefined,
    plannedAt: row.plannedAt ?? undefined,
    publishedAt: row.publishedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
    cancelReason: row.cancelReason ?? undefined,
    assigneeId: row.assigneeId ?? undefined,
    assigneeName: row.assigneeName ?? undefined,
    riskLevel: row.riskLevel ?? undefined,
    fallbackPackageId: row.fallbackPackageId ?? undefined,
    idempotencyKey: row.idempotencyKey ?? undefined
  };
}

/**
 * Allowed status transitions for DistributionTask.
 * draft -> waiting_audit (when bound to unapproved copy)
 * draft -> scheduled (when bound to approved copy with plannedAt)
 * waiting_audit -> scheduled (when copy approved)
 * waiting_audit -> blocked (when copy risk/rejected)
 * scheduled -> published (confirm publish)
 * scheduled -> overdue (>30min past plannedAt, manual mark)
 * scheduled -> failed (report failure)
 * published -> completed (attribution window ended, manual mark)
 * Any -> cancelled (with reason)
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['waiting_audit', 'scheduled', 'cancelled'],
  waiting_audit: ['scheduled', 'blocked', 'cancelled'],
  scheduled: ['published', 'overdue', 'failed', 'cancelled'],
  published: ['completed', 'cancelled'],
  completed: [],
  overdue: ['cancelled'],
  failed: [],
  cancelled: [],
  blocked: ['scheduled', 'cancelled']
};

@Injectable()
export class DistributionTaskService {
  private readonly logger = new Logger(DistributionTaskService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DistributionExecutionService)
    private readonly executionService: DistributionExecutionService
  ) {}

  async list(query: TaskQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.status) {
      conditions.push('t."status" = ?');
      params.push(query.status);
    }
    if (query.campaignId) {
      conditions.push('t."campaignId" = ?');
      params.push(query.campaignId);
    }
    if (query.groupId) {
      conditions.push('t."groupId" = ?');
      params.push(query.groupId);
    }
    if (query.assigneeId) {
      conditions.push('t."assigneeId" = ?');
      params.push(query.assigneeId);
    }
    if (query.dateFrom) {
      conditions.push('t."createdAt" >= ?');
      params.push(query.dateFrom);
    }
    if (query.dateTo) {
      conditions.push('t."createdAt" <= ?');
      params.push(query.dateTo);
    }
    if (query.overdue !== undefined && query.overdue === 1) {
      conditions.push(
        't."status" = \'scheduled\' AND t."plannedAt" IS NOT NULL AND t."plannedAt" <= ?'
      );
      params.push(new Date().toISOString());
    }
    if (query.hasAttribution !== undefined && query.hasAttribution === 1) {
      conditions.push(
        `EXISTS (SELECT 1 FROM "OrderAttribution" oa WHERE oa."taskId" = t."taskId")`
      );
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.prisma.$queryRawUnsafe<[{ cnt: number }]>(
      `SELECT COUNT(*) as cnt FROM "DistributionTask" t ${where}`,
      ...params
    );
    const total = Number(countResult[0].cnt);

    params.push(pageSize, (page - 1) * pageSize);
    const rows = await this.prisma.$queryRawUnsafe<TaskRow[]>(
      `SELECT t.* FROM "DistributionTask" t ${where} ORDER BY t."createdAt" DESC LIMIT ? OFFSET ?`,
      ...params
    );

    return {
      items: rows.map(parseTask),
      total,
      page,
      pageSize
    };
  }

  async getKpi() {
    const now = new Date().toISOString();
    const today = now.substring(0, 10);

    const results = await this.prisma.$queryRawUnsafe<
      [
        {
          todayPending: number;
          inProgress: number;
          completed: number;
          overdue: number;
          failed: number;
        }
      ]
    >(
      `SELECT
         COALESCE(SUM(CASE WHEN "status" = 'scheduled' THEN 1 ELSE 0 END), 0) as todayPending,
         COALESCE(SUM(CASE WHEN "status" IN ('published') THEN 1 ELSE 0 END), 0) as inProgress,
         COALESCE(SUM(CASE WHEN "status" = 'completed' THEN 1 ELSE 0 END), 0) as completed,
         COALESCE(SUM(CASE WHEN "status" = 'overdue' THEN 1 ELSE 0 END), 0) as overdue,
         COALESCE(SUM(CASE WHEN "status" = 'failed' THEN 1 ELSE 0 END), 0) as failed
       FROM "DistributionTask"
       WHERE DATE("createdAt") = ?`,
      today
    );

    const gmvResult = await this.prisma.$queryRawUnsafe<[{ todayTaskGmv: number }]>(
      `SELECT COALESCE(SUM("gmv"), 0) as todayTaskGmv
       FROM "TaskPerformanceDaily"
       WHERE "date" = ?`,
      today
    );

    return {
      todayPending: Number(results[0].todayPending),
      inProgress: Number(results[0].inProgress),
      completed: Number(results[0].completed),
      overdue: Number(results[0].overdue),
      failed: Number(results[0].failed),
      todayTaskGmv: Number(gmvResult[0].todayTaskGmv)
    };
  }

  async getById(id: string) {
    const rows = await this.prisma.$queryRawUnsafe<TaskRow[]>(
      `SELECT * FROM "DistributionTask" WHERE "taskId" = ?`,
      id
    );
    if (rows.length === 0) throw new NotFoundException('Distribution task not found');

    const executions = await this.executionService.findByTaskId(id);
    const task = parseTask(rows[0]);
    return { ...task, executions };
  }

  async create(dto: CreateTaskDto) {
    const taskId = this.generateId();
    const now = new Date().toISOString();
    const status = dto.status ?? 'draft';

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "DistributionTask" ("taskId", "campaignId", "contentId", "groupId", "packageId", "channel", "title", "body", "cta", "trackingCode", "status", "priority", "plannedAt", "assigneeId", "assigneeName", "riskLevel", "fallbackPackageId", "idempotencyKey", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      taskId,
      dto.campaignId ?? null,
      dto.contentId ?? null,
      dto.groupId ?? null,
      dto.packageId,
      dto.channel,
      dto.title ?? null,
      dto.body ?? null,
      dto.cta ?? null,
      dto.trackingCode ?? null,
      status,
      dto.priority ?? 'normal',
      dto.plannedAt ?? null,
      dto.assigneeId ?? null,
      dto.assigneeName ?? null,
      dto.riskLevel ?? 'low',
      dto.fallbackPackageId ?? null,
      dto.idempotencyKey ?? null,
      now,
      now
    );
    return this.getById(taskId);
  }

  async batchCreate(dtos: CreateTaskDto[]) {
    const results: unknown[] = [];
    for (const dto of dtos) {
      const created = await this.create(dto);
      results.push(created);
    }
    return { created: results.length, items: results };
  }

  async update(id: string, dto: UpdateTaskDto) {
    await this.getById(id);

    const sets: string[] = [];
    const params: unknown[] = [];

    if (dto.campaignId !== undefined) {
      sets.push('"campaignId" = ?');
      params.push(dto.campaignId ?? null);
    }
    if (dto.contentId !== undefined) {
      sets.push('"contentId" = ?');
      params.push(dto.contentId ?? null);
    }
    if (dto.groupId !== undefined) {
      sets.push('"groupId" = ?');
      params.push(dto.groupId ?? null);
    }
    if (dto.packageId !== undefined) {
      sets.push('"packageId" = ?');
      params.push(dto.packageId);
    }
    if (dto.channel !== undefined) {
      sets.push('"channel" = ?');
      params.push(dto.channel);
    }
    if (dto.title !== undefined) {
      sets.push('"title" = ?');
      params.push(dto.title ?? null);
    }
    if (dto.body !== undefined) {
      sets.push('"body" = ?');
      params.push(dto.body ?? null);
    }
    if (dto.priority !== undefined) {
      sets.push('"priority" = ?');
      params.push(dto.priority);
    }
    if (dto.plannedAt !== undefined) {
      sets.push('"plannedAt" = ?');
      params.push(dto.plannedAt ?? null);
    }
    if (dto.assigneeId !== undefined) {
      sets.push('"assigneeId" = ?');
      params.push(dto.assigneeId ?? null);
    }
    if (dto.assigneeName !== undefined) {
      sets.push('"assigneeName" = ?');
      params.push(dto.assigneeName ?? null);
    }
    if (dto.riskLevel !== undefined) {
      sets.push('"riskLevel" = ?');
      params.push(dto.riskLevel);
    }
    if (dto.fallbackPackageId !== undefined) {
      sets.push('"fallbackPackageId" = ?');
      params.push(dto.fallbackPackageId ?? null);
    }

    if (sets.length === 0) return this.getById(id);

    sets.push('"updatedAt" = ?');
    params.push(new Date().toISOString());
    params.push(id);

    await this.prisma.$executeRawUnsafe(
      `UPDATE "DistributionTask" SET ${sets.join(', ')} WHERE "taskId" = ?`,
      ...params
    );
    return this.getById(id);
  }

  async delete(id: string) {
    await this.getById(id);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "DistributionTask" WHERE "taskId" = ?`, id);
    return { success: true };
  }

  async publish(id: string, dto: PublishTaskDto) {
    const task = await this.getById(id);
    if (task.status !== 'scheduled') {
      throw new BadRequestException(
        `Cannot publish task with status '${task.status}'. Only 'scheduled' tasks can be published.`
      );
    }

    const now = new Date().toISOString();
    await this.prisma.$executeRawUnsafe(
      `UPDATE "DistributionTask" SET "status" = 'published', "publishedAt" = ?, "updatedAt" = ? WHERE "taskId" = ?`,
      now,
      now,
      id
    );

    await this.executionService.create({
      taskId: id,
      action: 'publish',
      operatorId: dto.operatorId,
      operatorName: dto.operatorName,
      evidenceUrl: dto.evidenceUrl,
      note: dto.note
    });

    return this.getById(id);
  }

  async fail(id: string, dto: FailTaskDto) {
    const task = await this.getById(id);
    if (task.status !== 'scheduled') {
      throw new BadRequestException(
        `Cannot fail task with status '${task.status}'. Only 'scheduled' tasks can be marked as failed.`
      );
    }

    const now = new Date().toISOString();
    await this.prisma.$executeRawUnsafe(
      `UPDATE "DistributionTask" SET "status" = 'failed', "updatedAt" = ? WHERE "taskId" = ?`,
      now,
      id
    );

    await this.executionService.create({
      taskId: id,
      action: 'confirm_fail',
      operatorId: dto.operatorId,
      operatorName: dto.operatorName,
      evidenceUrl: dto.evidenceUrl,
      failReason: dto.failReason,
      failCategory: dto.failCategory,
      note: dto.note
    });

    return this.getById(id);
  }

  async cancel(id: string, reason?: string) {
    const task = await this.getById(id);
    const allowed = VALID_TRANSITIONS[task.status] ?? [];
    if (!allowed.includes('cancelled')) {
      throw new BadRequestException(`Cannot cancel task with status '${task.status}'.`);
    }

    const now = new Date().toISOString();
    await this.prisma.$executeRawUnsafe(
      `UPDATE "DistributionTask" SET "status" = 'cancelled', "cancelReason" = ?, "updatedAt" = ? WHERE "taskId" = ?`,
      reason ?? null,
      now,
      id
    );

    await this.executionService.create({
      taskId: id,
      action: 'cancel',
      note: reason
    });

    return this.getById(id);
  }

  async reassign(id: string, assigneeId: string, assigneeName?: string) {
    await this.getById(id);
    const now = new Date().toISOString();
    await this.prisma.$executeRawUnsafe(
      `UPDATE "DistributionTask" SET "assigneeId" = ?, "assigneeName" = ?, "updatedAt" = ? WHERE "taskId" = ?`,
      assigneeId,
      assigneeName ?? null,
      now,
      id
    );
    return this.getById(id);
  }

  async getPerformance(id: string) {
    await this.getById(id);

    const perfRows = await this.prisma.$queryRawUnsafe<
      [
        {
          visitCount: number;
          orderCount: number;
          gmv: number;
          verifyCount: number;
          refundCount: number;
          conversionRate: number;
        }
      ]
    >(
      `SELECT
         COALESCE(SUM("visitCount"), 0) as visitCount,
         COALESCE(SUM("orderCount"), 0) as orderCount,
         COALESCE(SUM("gmv"), 0) as gmv,
         COALESCE(SUM("verifyCount"), 0) as verifyCount,
         COALESCE(SUM("refundCount"), 0) as refundCount,
         COALESCE(AVG("conversionRate"), 0) as conversionRate
       FROM "TaskPerformanceDaily"
       WHERE "taskId" = ?`,
      id
    );

    const r = perfRows[0];
    const visits = Number(r.visitCount);
    const orders = Number(r.orderCount);
    const gmv = Number(r.gmv);
    const verifyCount = Number(r.verifyCount);
    const refundCount = Number(r.refundCount);

    return {
      visits,
      orders,
      gmv,
      verifyRate: orders > 0 ? verifyCount / orders : 0,
      refundRate: orders > 0 ? refundCount / orders : 0,
      conversionRate: Number(r.conversionRate)
    };
  }

  private generateId(): string {
    return 'task_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
  }
}
