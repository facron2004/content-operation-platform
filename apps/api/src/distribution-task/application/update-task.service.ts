import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toSqliteDateTime } from '../../common/sqlite-datetime';
import { assertOptionalTaskFks, resolveActiveAssignee } from '../distribution-task-fk';
import { getDistributionTaskUpdateMeta } from '../distribution-task-read';
import { assertTaskUpdateMutable } from '../domain/task-update-policy';
import { UpdateTaskDto } from '../dto/update-task.dto';
import { updateTask, type TaskUpdateMeta } from '../repositories/task.repository';

export type PreloadedTaskUpdateMeta = Pick<
  TaskUpdateMeta,
  | 'status'
  | 'publishedAt'
  | 'packageId'
  | 'contentId'
  | 'campaignId'
  | 'groupId'
  | 'fallbackPackageId'
>;

/** Normalize optional plannedAt to SQLite-comparable UTC space form. */
function normalizePlannedAt(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  return toSqliteDateTime(value);
}

/**
 * Update a task with a narrow freeze/FK projection and an optimistic status pin.
 * The function is exported so the legacy service facade and the canonical command
 * service share exactly one write implementation.
 */
export async function updateDistributionTask(
  prisma: PrismaService,
  id: string,
  dto: UpdateTaskDto,
  preloadedMeta?: PreloadedTaskUpdateMeta
) {
  // Residual #129: freeze/FK projection only — not full getTaskRow (body/title/cta).
  // Residual #156: controller may pass meta from the same probe used for scope.
  const existing = preloadedMeta ?? (await getDistributionTaskUpdateMeta(prisma, id));

  assertTaskUpdateMutable(existing, dto);

  // packageId used for contentId FK package match when content is reassigned.
  // Always re-check existing content against effective package so a packageId
  // change on draft/waiting_audit cannot leave a mismatched bound copy.
  const effectivePackageId = dto.packageId ?? existing.packageId;
  const effectiveContentId = dto.contentId !== undefined ? dto.contentId : existing.contentId;
  await assertOptionalTaskFks(prisma, {
    ...dto,
    packageId: effectivePackageId,
    contentId: effectiveContentId,
    // Keep existing status so waiting_audit tasks can rebind pending copy.
    status: existing.status,
    excludeTaskId: id
  });
  // Resolve assignee when id is (re)bound; clearing assigneeId also clears name.
  let resolvedAssignee: { userId: string; displayName: string } | null | undefined = undefined;
  if (dto.assigneeId !== undefined) {
    resolvedAssignee = await resolveActiveAssignee(prisma, dto.assigneeId);
  }

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
  if (dto.cta !== undefined) {
    sets.push('"cta" = ?');
    params.push(dto.cta ?? null);
  }
  if (dto.priority !== undefined) {
    sets.push('"priority" = ?');
    params.push(dto.priority);
  }
  if (dto.plannedAt !== undefined) {
    sets.push('"plannedAt" = ?');
    params.push(normalizePlannedAt(dto.plannedAt));
  }
  if (dto.assigneeId !== undefined) {
    sets.push('"assigneeId" = ?');
    params.push(resolvedAssignee?.userId ?? null);
    // Always pair name with resolved id (or null) — ignore free-form assigneeName.
    sets.push('"assigneeName" = ?');
    params.push(resolvedAssignee?.displayName ?? null);
  }
  if (dto.riskLevel !== undefined) {
    sets.push('"riskLevel" = ?');
    params.push(dto.riskLevel);
  }
  if (dto.fallbackPackageId !== undefined) {
    sets.push('"fallbackPackageId" = ?');
    params.push(dto.fallbackPackageId ?? null);
  }

  // Residual #153: empty PATCH — freeze pre-probe already proved existence.
  // SPA form discards body + reloads list/detail; skip full getTaskRow re-SELECT.
  // Shell carries only freeze-projection fields (no invented channel/priority/timestamps).
  if (sets.length === 0) {
    return {
      success: true as const,
      taskId: id,
      campaignId: existing.campaignId ?? undefined,
      contentId: existing.contentId ?? undefined,
      groupId: existing.groupId ?? undefined,
      packageId: existing.packageId,
      status: existing.status,
      publishedAt: existing.publishedAt ?? undefined,
      fallbackPackageId: existing.fallbackPackageId ?? undefined
    };
  }

  // Residual #165: SPA form discards body + reloads list — drop the full-row
  // response payload; changed-rows is the existence/freeze probe (parity with #163/#164).
  // publish/schedule still hydrate free-form columns for SPA detail body reuse.
  const changed = await updateTask(prisma, id, sets, params, existing.status);
  if (changed <= 0) {
    // Residual #129: failure arm only needs freeze projection fields.
    const latest = await getDistributionTaskUpdateMeta(prisma, id);
    // Re-apply the same freeze policy against the new status if a concurrent
    // status command won the race.
    assertTaskUpdateMutable(latest, dto);
    throw new BadRequestException(`任务状态已变更（当前 '${latest.status}'），请刷新后重试`);
  }
  // Residual #165: slim shell from freeze projection + dto overlays (SPA discards body).
  return {
    success: true as const,
    taskId: id,
    campaignId:
      dto.campaignId !== undefined
        ? (dto.campaignId ?? undefined)
        : (existing.campaignId ?? undefined),
    contentId:
      dto.contentId !== undefined
        ? (dto.contentId ?? undefined)
        : (existing.contentId ?? undefined),
    groupId:
      dto.groupId !== undefined ? (dto.groupId ?? undefined) : (existing.groupId ?? undefined),
    packageId: dto.packageId ?? existing.packageId,
    status: existing.status,
    publishedAt: existing.publishedAt ?? undefined,
    fallbackPackageId:
      dto.fallbackPackageId !== undefined
        ? (dto.fallbackPackageId ?? undefined)
        : (existing.fallbackPackageId ?? undefined)
  };
}

@Injectable()
export class UpdateTaskService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  update(id: string, dto: UpdateTaskDto, preloadedMeta?: PreloadedTaskUpdateMeta) {
    return updateDistributionTask(this.prisma, id, dto, preloadedMeta);
  }
}
