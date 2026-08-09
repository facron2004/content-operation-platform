import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DistributionExecutionService } from './distribution-execution.service';
import { TaskQueryDto } from './dto/task-query.dto';
import {
  findTaskRow,
  getTaskKpi,
  getTaskPerformance,
  listTasks,
  parseTask
} from './distribution-task-query';
import {
  getAccessMeta,
  getDeleteMeta,
  getUpdateMeta,
  type TaskAccessMeta,
  type TaskDeleteMeta,
  type TaskUpdateMeta
} from './repositories/task.repository';

export function listDistributionTasks(
  prisma: PrismaService,
  query: TaskQueryDto,
  scope?: { unrestricted: boolean; areaIds: string[]; merchantIds: string[] }
) {
  return listTasks(prisma, query, scope);
}

export function getDistributionTaskKpi(prisma: PrismaService) {
  return getTaskKpi(prisma);
}

export async function getDistributionTaskById(
  prisma: PrismaService,
  executionService: DistributionExecutionService,
  id: string
) {
  const { packageGeo, ...task } = await getDistributionTaskRow(prisma, id);
  const timeline = await executionService.findByTaskId(id);
  // Residual #167: keep packageGeo for controller scope; strip from SPA detail body
  // only after assertTaskAccess — controller re-attaches via separate call path.
  // Residual #260: honesty flags when ASC LIMIT clips newer executions.
  return {
    ...task,
    executions: timeline.items,
    executionsTruncated: timeline.truncated,
    executionsLimit: timeline.limit,
    packageGeo
  };
}

export async function getDistributionTaskRow(prisma: PrismaService, id: string) {
  const row = await findTaskRow(prisma, id);
  if (!row) throw new NotFoundException('Distribution task not found');
  // Include trackingCode for admin/operator controller gate; list still redacts.
  // packageGeo is controller-only (scope fold); strip from SPA-facing detail body.
  const { packageGeo, ...task } = row;
  return {
    ...parseTask(task, { includeTrackingCode: true }),
    packageGeo
  };
}

export async function getDistributionTaskDeleteMeta(
  prisma: PrismaService,
  id: string
): Promise<TaskDeleteMeta> {
  const meta = await getDeleteMeta(prisma, id);
  if (!meta) throw new NotFoundException('Distribution task not found');
  return meta;
}

export async function getDistributionTaskUpdateMeta(
  prisma: PrismaService,
  id: string
): Promise<TaskUpdateMeta> {
  const meta = await getUpdateMeta(prisma, id);
  if (!meta) throw new NotFoundException('Distribution task not found');
  return meta;
}

export async function getDistributionTaskAccessMeta(
  prisma: PrismaService,
  id: string
): Promise<TaskAccessMeta> {
  const meta = await getAccessMeta(prisma, id);
  if (!meta) throw new NotFoundException('Distribution task not found');
  return meta;
}

export function getDistributionTaskPerformance(prisma: PrismaService, id: string) {
  // Residual #105: controller already getById for package scope; getTaskPerformance
  // aggregates by taskId only. Avoids a second full detail + executions reload.
  return getTaskPerformance(prisma, id);
}
