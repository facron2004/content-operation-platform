import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DistributionExecutionService } from './distribution-execution.service';
import { TaskQueryDto } from './dto/task-query.dto';
import {
  getDistributionTaskAccessMeta,
  getDistributionTaskById,
  getDistributionTaskDeleteMeta,
  getDistributionTaskKpi,
  getDistributionTaskPerformance,
  getDistributionTaskRow,
  getDistributionTaskUpdateMeta,
  listDistributionTasks
} from './distribution-task-read';
import type {
  TaskAccessMeta,
  TaskDeleteMeta,
  TaskUpdateMeta
} from './repositories/task.repository';
import {
  deleteDistributionTask,
  type PreloadedTaskDeleteMeta
} from './application/delete-task.service';
import {
  updateDistributionTask,
  type PreloadedTaskUpdateMeta
} from './application/update-task.service';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class DistributionTaskService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DistributionExecutionService)
    private readonly executionService: DistributionExecutionService
  ) {}

  async list(
    query: TaskQueryDto,
    scope?: { unrestricted: boolean; areaIds: string[]; merchantIds: string[] }
  ) {
    return listDistributionTasks(this.prisma, query, scope);
  }

  async getKpi() {
    return getDistributionTaskKpi(this.prisma);
  }

  async getById(id: string) {
    return getDistributionTaskById(this.prisma, this.executionService, id);
  }

  /** Full task row without executions timeline for controller scope and commands. */
  async getTaskRow(id: string) {
    return getDistributionTaskRow(this.prisma, id);
  }

  async getTaskDeleteMeta(id: string): Promise<TaskDeleteMeta> {
    return getDistributionTaskDeleteMeta(this.prisma, id);
  }

  async getTaskUpdateMeta(id: string): Promise<TaskUpdateMeta> {
    return getDistributionTaskUpdateMeta(this.prisma, id);
  }

  async getTaskAccessMeta(id: string): Promise<TaskAccessMeta> {
    return getDistributionTaskAccessMeta(this.prisma, id);
  }

  /** PackageId-only alias for callers that do not need status/geo. */
  async getTaskPackageId(id: string): Promise<string> {
    return (await this.getTaskAccessMeta(id)).packageId;
  }

  /** Compatibility facade; command controllers use UpdateTaskService directly. */
  update(id: string, dto: UpdateTaskDto, preloadedMeta?: PreloadedTaskUpdateMeta) {
    return updateDistributionTask(this.prisma, id, dto, preloadedMeta);
  }

  /** Compatibility facade; command controllers use DeleteTaskService directly. */
  delete(id: string, preloadedMeta?: PreloadedTaskDeleteMeta) {
    return deleteDistributionTask(this.prisma, id, preloadedMeta);
  }

  async getPerformance(id: string) {
    return getDistributionTaskPerformance(this.prisma, id);
  }
}
