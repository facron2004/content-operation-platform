import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { newEntityId } from '../common/id';
import { createHash } from 'crypto';

export type IdempotencyStatus = 'pending' | 'completed' | 'failed';

export interface IdempotencyRecord {
  id: string;
  idempotencyKey: string;
  operationType: string;
  requestHash: string;
  status: IdempotencyStatus;
  responseData: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** Default TTL for idempotency records: 24 hours. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class IdempotencyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Hash the request body for comparison. */
  hashRequest(body: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(body ?? {}))
      .digest('hex');
  }

  /**
   * Look up an existing idempotency record.
   * Returns null if no record exists or it has expired.
   */
  async findRecord(key: string, operationType: string): Promise<IdempotencyRecord | null> {
    const rows = await this.prisma.$queryRawUnsafe<IdempotencyRecord[]>(
      `SELECT * FROM "IdempotencyRecord"
       WHERE "idempotencyKey" = ? AND "operationType" = ?
       LIMIT 1`,
      key,
      operationType
    );
    const row = rows[0] ?? null;
    if (!row) return null;
    // Check expiry
    if (new Date(row.expiresAt) < new Date()) {
      // Expired — treat as not found
      await this.prisma.$executeRawUnsafe(`DELETE FROM "IdempotencyRecord" WHERE "id" = ?`, row.id);
      return null;
    }
    return row;
  }

  /**
   * Create a new idempotency record (optimistic — unique constraint guards races).
   */
  async tryCreate(
    key: string,
    operationType: string,
    requestHash: string,
    ttlMs: number = IDEMPOTENCY_TTL_MS
  ): Promise<IdempotencyRecord | null> {
    const id = newEntityId('idem');
    const expiresAt = new Date(Date.now() + ttlMs);
    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "IdempotencyRecord" ("id", "idempotencyKey", "operationType", "requestHash", "status", "expiresAt", "createdAt", "updatedAt")
         VALUES (?, ?, ?, ?, 'pending', ?, datetime('now'), datetime('now'))`,
        id,
        key,
        operationType,
        requestHash,
        expiresAt.toISOString()
      );
      return {
        id,
        idempotencyKey: key,
        operationType,
        requestHash,
        status: 'pending',
        responseData: null,
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    } catch {
      // Unique constraint violation: concurrent request won
      return null;
    }
  }

  /**
   * Mark an idempotency record as completed with response data.
   */
  async complete(id: string, responseData: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE "IdempotencyRecord" SET "status" = 'completed', "responseData" = ?, "updatedAt" = datetime('now')
       WHERE "id" = ?`,
      responseData,
      id
    );
  }

  /**
   * Mark an idempotency record as failed (on error).
   */
  async fail(id: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE "IdempotencyRecord" SET "status" = 'failed', "updatedAt" = datetime('now')
       WHERE "id" = ?`,
      id
    );
  }

  /**
   * Clean up expired records.
   */
  async purgeExpired(): Promise<number> {
    const result = await this.prisma.$executeRawUnsafe(
      `DELETE FROM "IdempotencyRecord" WHERE "expiresAt" < datetime('now')`
    );
    return Number(result ?? 0);
  }
}
