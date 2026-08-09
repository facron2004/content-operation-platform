import { Injectable, BadRequestException, Inject, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DistributionExecutionService } from '../distribution-execution.service';
import { toSqliteDateTime } from '../../common/sqlite-datetime';
import { assertOptionalTaskFks, resolveActiveAssignee } from '../distribution-task-fk';
import {
  canTransition,
  transitionCancel,
  transitionSchedule,
  transitionComplete,
  transitionReassign
} from '../domain/task-status-machine';
import { getStatus } from '../repositories/task.repository';
import { findTaskRow, parseTask } from '../distribution-task-query';

type PreloadedScheduleTask = {
  status: string;
  packageId: string;
  contentId?: string | null;
  groupId?: string | null;
  campaignId?: string | null;
  fallbackPackageId?: string | null;
  body?: string | null;
};

@Injectable()
export class CancelTaskService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DistributionExecutionService)
    private readonly executionService: DistributionExecutionService
  ) {}

  async cancel(id: string, reason?: string, preloadedStatus?: string) {
    const currentStatus = preloadedStatus ?? (await getStatus(this.prisma, id));
    if (!canTransition(currentStatus, 'cancelled')) {
      throw new BadRequestException(`Cannot cancel task with status '${currentStatus}'.`);
    }
    const returned = await transitionCancel(this.prisma, id, reason ?? null, currentStatus);
    if (!returned) {
      const latestStatus = await getStatus(this.prisma, id);
      throw new BadRequestException(`Cannot cancel task with status '${latestStatus}'.`);
    }
    await this.executionService.create({ taskId: id, action: 'cancel', note: reason });
    return parseTask(returned, { includeTrackingCode: false });
  }

  async schedule(id: string, plannedAt: string, preloadedTask?: string | PreloadedScheduleTask) {
    const task =
      typeof preloadedTask === 'string'
        ? undefined
        : (preloadedTask ?? (await this.loadScheduleTask(id)));
    const currentStatus =
      typeof preloadedTask === 'string'
        ? preloadedTask
        : (task?.status ?? (await getStatus(this.prisma, id)));
    if (!canTransition(currentStatus, 'scheduled')) {
      throw new BadRequestException(
        `Cannot schedule task with status '${currentStatus}'. Allowed: draft/waiting_audit/blocked.`
      );
    }
    if (!plannedAt) {
      throw new BadRequestException('status=scheduled 时必须提供 plannedAt');
    }
    let planned: string;
    try {
      planned = toSqliteDateTime(plannedAt);
    } catch {
      throw new BadRequestException('plannedAt 无效');
    }

    if (task) {
      if (task.contentId) {
        await assertOptionalTaskFks(this.prisma, {
          contentId: task.contentId,
          packageId: task.packageId,
          groupId: task.groupId,
          campaignId: task.campaignId,
          fallbackPackageId: task.fallbackPackageId,
          status: 'scheduled',
          excludeTaskId: id
        });
      } else if (!task.body?.trim()) {
        throw new BadRequestException('调度失败：任务缺少 contentId 或 body');
      } else {
        await assertOptionalTaskFks(this.prisma, {
          packageId: task.packageId,
          groupId: task.groupId,
          campaignId: task.campaignId,
          fallbackPackageId: task.fallbackPackageId,
          status: 'scheduled',
          excludeTaskId: id
        });
      }
    }

    const returned = await transitionSchedule(this.prisma, id, planned, currentStatus);
    if (!returned) {
      const latestStatus = await getStatus(this.prisma, id);
      throw new BadRequestException(`Cannot schedule task with status '${latestStatus}'.`);
    }
    await this.executionService.create({
      taskId: id,
      action: 'schedule',
      note: `plannedAt=${planned}`
    });
    return parseTask(returned, { includeTrackingCode: false });
  }

  async complete(id: string, preloadedStatus?: string) {
    const currentStatus = preloadedStatus ?? (await getStatus(this.prisma, id));
    if (currentStatus !== 'published') {
      throw new BadRequestException(
        `Cannot complete task with status '${currentStatus}'. Only 'published' tasks can be completed.`
      );
    }
    const returned = await transitionComplete(this.prisma, id, currentStatus);
    if (!returned) {
      const latestStatus = await getStatus(this.prisma, id);
      throw new BadRequestException(`Cannot complete task with status '${latestStatus}'.`);
    }
    await this.executionService.create({ taskId: id, action: 'complete' });
    return parseTask(returned, { includeTrackingCode: false });
  }

  async reassign(id: string, assigneeId: string, _assigneeName?: string, preloadedStatus?: string) {
    const currentStatus = preloadedStatus ?? (await getStatus(this.prisma, id));
    if (['completed', 'failed', 'cancelled'].includes(currentStatus)) {
      throw new BadRequestException(`Cannot reassign task with status '${currentStatus}'.`);
    }
    const assignee = await resolveActiveAssignee(this.prisma, assigneeId);
    if (!assignee) throw new BadRequestException('assigneeId 不能为空');
    const returned = await transitionReassign(
      this.prisma,
      id,
      assignee.userId,
      assignee.displayName,
      currentStatus
    );
    if (!returned) {
      const latestStatus = await getStatus(this.prisma, id);
      throw new BadRequestException(`Cannot reassign task with status '${latestStatus}'.`);
    }
    return parseTask(returned, { includeTrackingCode: false });
  }

  private async loadScheduleTask(id: string): Promise<PreloadedScheduleTask> {
    const row = await findTaskRow(this.prisma, id);
    if (!row) throw new NotFoundException('Distribution task not found');
    return row;
  }
}
