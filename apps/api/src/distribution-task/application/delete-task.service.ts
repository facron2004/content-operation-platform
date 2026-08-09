import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getDistributionTaskDeleteMeta } from '../distribution-task-read';
import { isDeletable } from '../domain/task-status-machine';
import { deleteTask, type TaskDeleteMeta } from '../repositories/task.repository';

export type PreloadedTaskDeleteMeta = Pick<TaskDeleteMeta, 'packageId' | 'status' | 'publishedAt'>;

/**
 * Delete a task through the atomic repository command while retaining the
 * status/history safeguards used by the legacy facade.
 */
export async function deleteDistributionTask(
  prisma: PrismaService,
  id: string,
  preloadedMeta?: PreloadedTaskDeleteMeta
) {
  // Residual #107: status + publishedAt only — delete never needs executions/body.
  // Residual #159: controller may pass meta from the same probe used for scope.
  const task = preloadedMeta ?? (await getDistributionTaskDeleteMeta(prisma, id));
  if (!isDeletable(task.status)) {
    throw new BadRequestException(
      `Cannot delete task with status '${task.status}'. Cancel it first, or only delete draft/cancelled/failed tasks.`
    );
  }
  // Pre-check publishedAt for a clearer error before the atomic delete.
  if (task.publishedAt) {
    throw new BadRequestException(
      'Cannot delete a task that was published; keep it cancelled as a tombstone'
    );
  }
  // Atomic delete: pin status + zero refs so concurrent bind/visit/publish cannot
  // leave orphans or wipe history between COUNT and DELETE.
  const changed = await deleteTask(prisma, id, task.status);
  if (changed <= 0) {
    const latest = await getDistributionTaskDeleteMeta(prisma, id);
    if (!isDeletable(latest.status)) {
      throw new BadRequestException(
        `Cannot delete a task with status '${latest.status}'. Cancel it first, or only delete draft/cancelled/failed tasks.`
      );
    }
    if (latest.publishedAt) {
      throw new BadRequestException(
        'Cannot delete a task that was published; keep it cancelled as a tombstone'
      );
    }
    throw new BadRequestException(
      'Cannot delete a task with attribution or visit history; keep it cancelled as a tombstone'
    );
  }
  return { success: true };
}

@Injectable()
export class DeleteTaskService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  delete(id: string, preloadedMeta?: PreloadedTaskDeleteMeta) {
    return deleteDistributionTask(this.prisma, id, preloadedMeta);
  }
}
