import { Inject, Injectable } from '@nestjs/common';
import { newEntityId } from '../common/id';
import { EXECUTION_SNAPSHOT_MAX_CHARS, EXECUTION_TIMELINE_LIMIT } from '../common/sql-chunk';
import { toSqliteDateTime } from '../common/sqlite-datetime';
import { PrismaService } from '../prisma/prisma.service';
import type { Tx } from './repositories/task.repository';

export interface CreateExecutionInput {
  taskId: string;
  action: 'publish' | 'reschedule' | 'schedule' | 'complete' | 'cancel' | 'confirm_fail';
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

  async create(input: CreateExecutionInput, db: Tx = this.prisma) {
    const executionId = this.generateId();
    const now = toSqliteDateTime();
    // Cap snapshotJson so a future writer cannot pin SQLite with multi-MB dumps.
    // Readers already omit the column from task timelines.
    let snapshot: string | null = input.snapshotJson ?? null;
    if (snapshot != null && snapshot.length > EXECUTION_SNAPSHOT_MAX_CHARS) {
      snapshot = `${snapshot.slice(0, EXECUTION_SNAPSHOT_MAX_CHARS)}…[truncated]`;
    }
    await db.$executeRawUnsafe(
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
      snapshot,
      now
    );
    return executionId;
  }

  /**
   * Residual #260: return items + honesty flags (SKU #250 parity).
   * ORDER BY createdAt ASC LIMIT N keeps earliest N — when truncated, newer
   * executions may be missing from the detail timeline.
   */
  async findByTaskId(taskId: string) {
    // Cap history length — unbounded execution timelines can grow without bound.
    // Explicit column list: never SELECT * so snapshotJson (internal task dump)
    // cannot leak onto task detail responses if a writer starts populating it.
    const rows = await this.prisma.$queryRawUnsafe<Array<Omit<ExecutionRow, 'snapshotJson'>>>(
      `SELECT "executionId", "taskId", "action", "operatorId", "operatorName",
              "evidenceUrl", "failReason", "failCategory", "note", "createdAt"
       FROM "DistributionExecution"
       WHERE "taskId" = ?
       ORDER BY "createdAt" ASC
       LIMIT ?`,
      taskId,
      EXECUTION_TIMELINE_LIMIT
    );
    const items = rows.map((r) => ({
      executionId: r.executionId,
      taskId: r.taskId,
      action: r.action,
      operatorId: r.operatorId ?? undefined,
      operatorName: r.operatorName ?? undefined,
      evidenceUrl: r.evidenceUrl ?? undefined,
      failReason: r.failReason ?? undefined,
      failCategory: r.failCategory ?? undefined,
      note: r.note ?? undefined,
      createdAt: r.createdAt
    }));
    return {
      items,
      truncated: items.length >= EXECUTION_TIMELINE_LIMIT,
      limit: EXECUTION_TIMELINE_LIMIT
    };
  }

  private generateId(): string {
    return newEntityId('exec');
  }
}
