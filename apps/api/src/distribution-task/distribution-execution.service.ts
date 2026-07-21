import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateExecutionInput {
  taskId: string;
  action: 'publish' | 'reschedule' | 'cancel' | 'confirm_fail';
  operatorId?: string;
  operatorName?: string;
  evidenceUrl?: string;
  failReason?: string;
  failCategory?: string;
  note?: string;
  snapshotJson?: string;
}

interface ExecutionRow {
  executionId: string;
  taskId: string;
  action: string;
  operatorId: string | null;
  operatorName: string | null;
  evidenceUrl: string | null;
  failReason: string | null;
  failCategory: string | null;
  note: string | null;
  snapshotJson: string | null;
  createdAt: string;
}

@Injectable()
export class DistributionExecutionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(input: CreateExecutionInput) {
    const executionId = this.generateId();
    const now = new Date().toISOString();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "DistributionExecution" ("executionId", "taskId", "action", "operatorId", "operatorName", "evidenceUrl", "failReason", "failCategory", "note", "snapshotJson", "createdAt")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      executionId,
      input.taskId,
      input.action,
      input.operatorId ?? null,
      input.operatorName ?? null,
      input.evidenceUrl ?? null,
      input.failReason ?? null,
      input.failCategory ?? null,
      input.note ?? null,
      input.snapshotJson ?? null,
      now
    );
    return executionId;
  }

  async findByTaskId(taskId: string) {
    const rows = await this.prisma.$queryRawUnsafe<ExecutionRow[]>(
      `SELECT * FROM "DistributionExecution" WHERE "taskId" = ? ORDER BY "createdAt" ASC`,
      taskId
    );
    return rows.map((r) => ({
      ...r,
      operatorId: r.operatorId ?? undefined,
      operatorName: r.operatorName ?? undefined,
      evidenceUrl: r.evidenceUrl ?? undefined,
      failReason: r.failReason ?? undefined,
      failCategory: r.failCategory ?? undefined,
      note: r.note ?? undefined
    }));
  }

  private generateId(): string {
    return 'exec_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
  }
}
