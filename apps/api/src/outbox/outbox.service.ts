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
  nextRetryAt: string | null;
  createdAt: string;
  processedAt: string | null;
}

export interface OutboxEventContext extends OutboxEventRow {
  payload: Record<string, unknown>;
}

export type OutboxEventHandler = (event: OutboxEventContext) => Promise<void> | void;

export const OUTBOX_MAX_RETRIES = 5;

export type DbClient = Pick<PrismaService, '$queryRawUnsafe' | '$executeRawUnsafe'>;

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);
  private readonly handlers = new Map<string, OutboxEventHandler>();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Register the single handler responsible for an event type. */
  registerHandler(eventType: string, handler: OutboxEventHandler): void {
    const normalized = eventType.trim();
    if (!normalized) throw new Error('Outbox event type cannot be empty');
    if (this.handlers.has(normalized)) {
      throw new Error(`Outbox handler already registered for '${normalized}'`);
    }
    this.handlers.set(normalized, handler);
  }

  /** Dispatch an event and let the caller decide when to mark it processed. */
  async dispatch(event: OutboxEventRow): Promise<void> {
    const handler = this.handlers.get(event.eventType);
    if (!handler) {
      throw new Error(`No Outbox handler registered for event type '${event.eventType}'`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(event.payloadJson);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid Outbox payload for '${event.id}': ${message}`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`Outbox payload for '${event.id}' must be a JSON object`);
    }

    await handler({ ...event, payload: parsed as Record<string, unknown> });
  }

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
      `SELECT "id", "aggregateType", "aggregateId", "eventType", "payloadJson",
              "status", "retryCount", "errorMessage", "nextRetryAt", "createdAt", "processedAt"
       FROM "OutboxEvent"
       WHERE "status" = 'pending'
         AND "retryCount" < ${OUTBOX_MAX_RETRIES}
         AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= datetime('now'))
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
       SET "status" = 'processed', "processedAt" = ?, "nextRetryAt" = NULL
       WHERE "id" = ? AND "status" = 'pending'`,
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
           "nextRetryAt" = CASE
             WHEN "retryCount" + 1 >= ${OUTBOX_MAX_RETRIES} THEN NULL
             ELSE datetime('now', '+' || CAST((1 << "retryCount") AS TEXT) || ' minutes')
           END,
           "status" = CASE WHEN "retryCount" + 1 >= ${OUTBOX_MAX_RETRIES} THEN 'failed' ELSE 'pending' END
       WHERE "id" = ?`,
      error.slice(0, 500),
      id
    );
  }
}
