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

function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE|P2002|unique constraint/i.test(message);
}

function normalizeForHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForHash);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeForHash(item)])
    );
  }
  return value;
}

@Injectable()
export class IdempotencyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Hash the request body for comparison. */
  hashRequest(body: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(normalizeForHash(body ?? {})))
      .digest('hex');
  }

  /**
   * Look up an existing idempotency record.
   * Returns null if no record exists or it has expired.
   */
  async findRecord(key: string, operationType: string): Promise<IdempotencyRecord | null> {
    const rows = await this.prisma.$queryRawUnsafe<IdempotencyRecord[]>(
      `SELECT "id", "idempotencyKey", "operationType", "requestHash", "status",
              "responseData", "expiresAt", "createdAt", "updatedAt"
       FROM "IdempotencyRecord"
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
    } catch (error: unknown) {
      // Only a unique-key race means another request won. Database locks,
      // connection failures, and other persistence faults must remain visible.
      if (isUniqueConstraintError(error)) return null;
      throw error;
    }
  }

  /** Atomically reacquire a failed record so concurrent retries cannot both execute. */
  async tryAcquireFailed(id: string): Promise<boolean> {
    const result = await this.prisma.$executeRawUnsafe(
      `UPDATE "IdempotencyRecord"
       SET "status" = 'pending', "responseData" = NULL, "updatedAt" = datetime('now')
       WHERE "id" = ? AND "status" = 'failed'`,
      id
    );
    return Number(result ?? 0) === 1;
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
      `DELETE FROM "IdempotencyRecord" WHERE datetime("expiresAt") < datetime('now')`
    );
    return Number(result ?? 0);
  }
}
