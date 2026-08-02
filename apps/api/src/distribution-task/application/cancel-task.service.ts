import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { canTransition } from '../domain/task-status-machine';
import {
  transitionCancel,
  transitionSchedule,
  transitionComplete,
  transitionReassign
} from '../domain/task-status-machine';
import { getStatus } from '../repositories/task.repository';
import { parseTask } from '../distribution-task-query';

@Injectable()
export class CancelTaskService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
    return parseTask(returned, { includeTrackingCode: false });
  }

  async schedule(id: string, plannedAt: string, preloadedTask?: string | { status: string }) {
    const currentStatus =
      typeof preloadedTask === 'string'
        ? preloadedTask
        : (preloadedTask?.status ?? (await getStatus(this.prisma, id)));
    if (!canTransition(currentStatus, 'scheduled')) {
      throw new BadRequestException(
        `Cannot schedule task with status '${currentStatus}'. Allowed: draft/waiting_audit/blocked.`
      );
    }
    if (!plannedAt) {
      throw new BadRequestException('status=scheduled 时必须提供 plannedAt');
    }
    const returned = await transitionSchedule(this.prisma, id, plannedAt, currentStatus);
    if (!returned) {
      const latestStatus = await getStatus(this.prisma, id);
      throw new BadRequestException(`Cannot schedule task with status '${latestStatus}'.`);
    }
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
    return parseTask(returned, { includeTrackingCode: false });
  }

  async reassign(id: string, assigneeId: string, assigneeName?: string, preloadedStatus?: string) {
    const currentStatus = preloadedStatus ?? (await getStatus(this.prisma, id));
    if (['completed', 'failed', 'cancelled'].includes(currentStatus)) {
      throw new BadRequestException(`Cannot reassign task with status '${currentStatus}'.`);
    }
    const displayName = assigneeName ?? undefined;
    const returned = await transitionReassign(
      this.prisma,
      id,
      assigneeId,
      displayName ?? null,
      currentStatus
    );
    if (!returned) {
      const latestStatus = await getStatus(this.prisma, id);
      throw new BadRequestException(`Cannot reassign task with status '${latestStatus}'.`);
    }
    return parseTask(returned, { includeTrackingCode: false });
  }
}
