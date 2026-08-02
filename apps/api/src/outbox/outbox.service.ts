import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { newEntityId } from '../common/id';
import { toSqliteDateTime } from '../common/sqlite-datetime';

export interface OutboxEventRow {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payloadJson: string;
  status: 'pending' | 'processed' | 'failed';
  retryCount: number;
  errorMessage: string | null;
  createdAt: string;
  processedAt: string | null;
}

export type DbClient = PrismaService | Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Publish an outbox event. Accepts transaction context or uses standard Prisma instance.
   */
  async publishEvent(
    db: DbClient,
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<string> {
    const id = newEntityId('evt');
    const payloadJson = JSON.stringify(payload);

    await db.$executeRawUnsafe(
      `INSERT INTO "OutboxEvent" ("id", "aggregateType", "aggregateId", "eventType", "payloadJson", "status", "retryCount", "createdAt")
       VALUES (?, ?, ?, ?, ?, 'pending', 0, datetime('now'))`,
      id,
      aggregateType,
      aggregateId,
      eventType,
      payloadJson
    );

    return id;
  }

  /**
   * Batch fetch pending events for processing.
   */
  async fetchPending(limit = 50): Promise<OutboxEventRow[]> {
    return this.prisma.$queryRawUnsafe<OutboxEventRow[]>(
      `SELECT * FROM "OutboxEvent"
       WHERE "status" = 'pending' AND "retryCount" < 5
       ORDER BY "createdAt" ASC
       LIMIT ?`,
      limit
    );
  }

  /**
   * Mark an outbox event as successfully processed.
   */
  async markProcessed(id: string): Promise<void> {
    const now = toSqliteDateTime();
    await this.prisma.$executeRawUnsafe(
      `UPDATE "OutboxEvent"
       SET "status" = 'processed', "processedAt" = ?
       WHERE "id" = ?`,
      now,
      id
    );
  }

  /**
   * Increment retry count and mark as failed if retry limit reached.
   */
  async markFailed(id: string, error: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE "OutboxEvent"
       SET "retryCount" = "retryCount" + 1,
           "errorMessage" = ?,
           "status" = CASE WHEN "retryCount" + 1 >= 5 THEN 'failed' ELSE 'pending' END
       WHERE "id" = ?`,
      error.slice(0, 500),
      id
    );
  }
}
