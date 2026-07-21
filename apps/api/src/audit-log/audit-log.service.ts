import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogEntry {
  userId?: string;
  username?: string;
  action: string;
  objectType: string;
  objectId?: string;
  before?: string;
  after?: string;
  result?: string;
  failReason?: string;
  ip?: string;
}

interface AuditLogRow {
  logId: string;
  userId: string | null;
  username: string | null;
  action: string;
  objectType: string;
  objectId: string | null;
  before: string | null;
  after: string | null;
  result: string | null;
  failReason: string | null;
  ip: string | null;
  createdAt: string;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Create an audit log entry. Throws on error.
   */
  async log(entry: AuditLogEntry): Promise<void> {
    const logId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "OperationAuditLog" ("logId", "userId", "username", "action", "objectType", "objectId", "before", "after", "result", "failReason", "ip", "createdAt")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      logId,
      entry.userId ?? null,
      entry.username ?? null,
      entry.action,
      entry.objectType,
      entry.objectId ?? null,
      entry.before ?? null,
      entry.after ?? null,
      entry.result ?? null,
      entry.failReason ?? null,
      entry.ip ?? null
    );
  }

  /**
   * Wrapper that catches errors silently — for use in interceptors.
   */
  async tryLog(entry: AuditLogEntry): Promise<void> {
    try {
      await this.log(entry);
    } catch (e) {
      this.logger.warn(`Audit log write failed (silent): ${(e as Error).message}`);
    }
  }

  /**
   * Paginated query with filters.
   */
  async list(filters: {
    userId?: string;
    action?: string;
    objectType?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.userId) {
      conditions.push(`"userId" = ?`);
      params.push(filters.userId);
    }
    if (filters.action) {
      conditions.push(`"action" LIKE ?`);
      params.push(`%${filters.action}%`);
    }
    if (filters.objectType) {
      conditions.push(`"objectType" = ?`);
      params.push(filters.objectType);
    }
    if (filters.dateFrom) {
      conditions.push(`"createdAt" >= ?`);
      params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      conditions.push(`"createdAt" <= ?`);
      params.push(filters.dateTo);
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const countParams = [...params];
    const countRows = await this.prisma.$queryRawUnsafe<[{ count: number }]>(
      `SELECT COUNT(*) as count FROM "OperationAuditLog" ${where}`,
      ...countParams
    );
    const total = Number(countRows[0]?.count ?? 0);

    const queryParams = [...params, pageSize, offset];
    const rows = await this.prisma.$queryRawUnsafe<AuditLogRow[]>(
      `SELECT * FROM "OperationAuditLog" ${where} ORDER BY "createdAt" DESC LIMIT ? OFFSET ?`,
      ...queryParams
    );

    const data = rows.map(this.mapRow);

    return { data, total, page, pageSize };
  }

  /**
   * Get a single audit log by logId.
   */
  async findById(logId: string) {
    const rows = await this.prisma.$queryRawUnsafe<AuditLogRow[]>(
      `SELECT * FROM "OperationAuditLog" WHERE "logId" = ?`,
      logId
    );
    if (!rows[0]) return null;
    return this.mapRow(rows[0]);
  }

  private mapRow(row: AuditLogRow) {
    return {
      logId: row.logId,
      userId: row.userId ?? undefined,
      username: row.username ?? undefined,
      action: row.action,
      objectType: row.objectType,
      objectId: row.objectId ?? undefined,
      before: row.before ?? undefined,
      after: row.after ?? undefined,
      result: row.result ?? undefined,
      failReason: row.failReason ?? undefined,
      ip: row.ip ?? undefined,
      createdAt: row.createdAt
    };
  }
}
