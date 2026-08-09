import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { newEntityId } from '../../common/id';
import { toSqliteDateTime } from '../../common/sqlite-datetime';
import { allocateTrackingCode, allocateTrackingCodes } from '../../common/tracking-code';
import { CreateTaskDto } from '../dto/create-task.dto';
import { assertOptionalTaskFksFromMaps, loadTaskFkBatch } from '../distribution-task-fk';
import { getStatus } from '../repositories/task.repository';
import {
  insertTask,
  findByIdempotencyKey,
  batchRollback,
  type InsertTaskParams
} from '../repositories/task.repository';

function normalizePlannedAt(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  return toSqliteDateTime(value);
}

@Injectable()
export class CreateTaskService {
  private readonly logger = new Logger(CreateTaskService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(dto: CreateTaskDto) {
    const idempotencyKey = dto.idempotencyKey?.trim().slice(0, 100) || null;
    if (idempotencyKey) {
      const existing = await findByIdempotencyKey(this.prisma, idempotencyKey);
      if (existing) {
        return {
          success: true as const,
          taskId: existing,
          status: await getStatus(this.prisma, existing)
        };
      }
    }

    const status = dto.status ?? 'draft';
    this.assertCreateStatusRules(dto, status);

    const maps = await loadTaskFkBatch(this.prisma, [dto]);
    assertOptionalTaskFksFromMaps(
      {
        packageId: dto.packageId,
        campaignId: dto.campaignId,
        groupId: dto.groupId,
        fallbackPackageId: dto.fallbackPackageId,
        contentId: dto.contentId,
        status
      },
      maps
    );

    const assignee = this.resolveFromMap(dto.assigneeId, maps.assignees);

    return this.insertRow(dto, status, assignee, {});
  }

  async batchCreate(dtos: CreateTaskDto[]) {
    const list = Array.isArray(dtos) ? dtos : [];

    const maps = await loadTaskFkBatch(this.prisma, list);

    // Pre-validate each row
    const assignees: Array<{ userId: string; displayName: string } | null> = [];
    for (let i = 0; i < list.length; i++) {
      const dto = list[i];
      const status = dto.status ?? 'draft';
      try {
        this.assertCreateStatusRules(dto, status);
        assertOptionalTaskFksFromMaps(
          {
            packageId: dto.packageId,
            campaignId: dto.campaignId,
            groupId: dto.groupId,
            fallbackPackageId: dto.fallbackPackageId,
            contentId: dto.contentId,
            status
          },
          maps
        );
        assignees.push(this.resolveFromMap(dto.assigneeId, maps.assignees));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err ?? 'validation failed');
        throw new BadRequestException(`批量创建第 ${i + 1} 行失败: ${msg}`);
      }
    }

    // Check within-batch contentId uniqueness
    const seenContent = new Set<string>();
    for (let i = 0; i < list.length; i++) {
      const cid = list[i].contentId?.trim();
      if (!cid) continue;
      if (seenContent.has(cid)) {
        throw new BadRequestException(
          `批量创建第 ${i + 1} 行失败: 文案 contentId=${cid} 在同一批次中重复绑定`
        );
      }
      seenContent.add(cid);
    }

    const trackingCodes = await allocateTrackingCodes(this.prisma, list.length, {
      onExhausted: () => {
        throw new BadRequestException('Unable to allocate unique tracking code');
      }
    });

    const createdIds: string[] = [];
    try {
      for (let i = 0; i < list.length; i++) {
        const dto = list[i];
        const status = dto.status ?? 'draft';
        const created = await this.insertRow(dto, status, assignees[i], {
          trackingCode: trackingCodes[i]
        });
        if (created?.taskId) {
          createdIds.push(String(created.taskId));
        }
      }
    } catch (err) {
      if (createdIds.length) {
        try {
          await batchRollback(this.prisma, createdIds);
        } catch (cleanupErr) {
          this.logger.warn(
            `batchCreate rollback failed for ${createdIds.length} tasks: ${cleanupErr}`
          );
        }
      }
      throw err;
    }

    return { success: true as const, created: createdIds.length };
  }

  /** Status integrity checks for create / batchCreate. */
  private assertCreateStatusRules(dto: CreateTaskDto, status: string): void {
    if (status === 'scheduled' && !dto.plannedAt) {
      throw new BadRequestException('status=scheduled 时必须提供 plannedAt');
    }
    if (status === 'scheduled' && !dto.contentId?.trim() && !dto.body?.trim()) {
      throw new BadRequestException('status=scheduled 时必须提供 contentId 或 body');
    }
    if (status === 'waiting_audit' && !dto.contentId?.trim()) {
      throw new BadRequestException('status=waiting_audit 时必须提供 contentId');
    }
  }

  private resolveFromMap(
    assigneeId: string | null | undefined,
    assignees: Map<string, { userId: string; displayName: string; active: boolean }>
  ): { userId: string; displayName: string } | null {
    if (assigneeId == null || String(assigneeId).trim() === '') return null;
    const id = String(assigneeId).trim().slice(0, 64);
    const row = assignees.get(id);
    if (!row) throw new NotFoundException(`指派用户不存在: ${id}`);
    if (!row.active) throw new BadRequestException(`指派用户已停用: ${id}`);
    return { userId: row.userId, displayName: row.displayName };
  }

  private async insertRow(
    dto: CreateTaskDto,
    status: string,
    assignee: { userId: string; displayName: string } | null,
    opts: { trackingCode?: string }
  ) {
    const idempotencyKey = dto.idempotencyKey?.trim().slice(0, 100) || null;
    const taskId = newEntityId('task');
    const trackingCode =
      opts.trackingCode ??
      (await allocateTrackingCode(this.prisma, {
        onExhausted: () => {
          throw new BadRequestException('Unable to allocate unique tracking code');
        }
      }));

    const params: InsertTaskParams = {
      taskId,
      campaignId: dto.campaignId ?? null,
      contentId: dto.contentId ?? null,
      groupId: dto.groupId ?? null,
      packageId: dto.packageId,
      channel: dto.channel,
      title: dto.title ?? null,
      body: dto.body ?? null,
      cta: dto.cta ?? null,
      trackingCode,
      status,
      priority: dto.priority ?? 'normal',
      plannedAt: normalizePlannedAt(dto.plannedAt),
      assigneeId: assignee?.userId ?? null,
      assigneeName: assignee?.displayName ?? null,
      riskLevel: dto.riskLevel ?? 'low',
      fallbackPackageId: dto.fallbackPackageId ?? null,
      idempotencyKey
    };

    try {
      await insertTask(this.prisma, params);
    } catch (err) {
      if (idempotencyKey && this.isUniqueViolation(err)) {
        const winner = await findByIdempotencyKey(this.prisma, idempotencyKey);
        if (winner) {
          return {
            success: true as const,
            taskId: winner,
            status: await getStatus(this.prisma, winner)
          };
        }
      }
      throw err;
    }
    return { success: true as const, taskId, status };
  }

  private isUniqueViolation(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err ?? '');
    return /UNIQUE constraint failed|unique constraint|SQLITE_CONSTRAINT_UNIQUE/i.test(msg);
  }
}
