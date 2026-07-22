import { Inject, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DistributionExecutionService } from './distribution-execution.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskQueryDto } from './dto/task-query.dto';
import { PublishTaskDto } from './dto/publish-task.dto';
import { FailTaskDto } from './dto/fail-task.dto';
import {
  findTaskRow,
  getTaskKpi,
  getTaskPerformance,
  listTasks,
  parseTask
} from './distribution-task-query';
import { canTransition } from './distribution-task-transitions';

@Injectable()
export class DistributionTaskService {
  private readonly logger = new Logger(DistributionTaskService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DistributionExecutionService)
    private readonly executionService: DistributionExecutionService
  ) {}

  async list(query: TaskQueryDto) {
    return listTasks(this.prisma, query);
  }

  async getKpi() {
    return getTaskKpi(this.prisma);
  }

  async getById(id: string) {
    const row = await findTaskRow(this.prisma, id);
    if (!row) throw new NotFoundException('Distribution task not found');

    const executions = await this.executionService.findByTaskId(id);
    const task = parseTask(row);
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
    if (!canTransition(task.status, 'cancelled')) {
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
    return getTaskPerformance(this.prisma, id);
  }

  private generateId(): string {
    return 'task_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
  }
}
