import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { likeContains } from '../common/like-escape';
import { newEntityId } from '../common/id';
import {
  beijingDayRangeSqlite,
  sqlDatetimeExclusiveRange,
  toSqliteDateTime
} from '../common/sqlite-datetime';
import { INTERACTIVE_LIST_MAX_DAYS, resolveInteractiveDateSpan } from '../common/list-date-span';
import { clampListPage, clampListPageSize } from '../common/sql-chunk';

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

/** Full row including before/after blobs (detail path only). */
const AUDIT_LOG_ROW_COLUMNS = `"logId", "userId", "username", "action", "objectType",
  "objectId", "before", "after", "result", "failReason", "ip", "createdAt"`;

/** Interactive list omits free-form before/after JSON (≤4 KB each × page). */
const AUDIT_LOG_LIST_COLUMNS = `"logId", "userId", "username", "action", "objectType",
  "objectId", "result", "failReason", "ip", "createdAt"`;

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Create an audit log entry. Throws on error.
   */
  async log(entry: AuditLogEntry): Promise<void> {
    const logId = newEntityId();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "OperationAuditLog" ("logId", "userId", "username", "action", "objectType", "objectId", "before", "after", "result", "failReason", "ip", "createdAt")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      entry.ip ?? null,
      toSqliteDateTime()
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
    // Defense-in-depth: clamp even if a caller bypasses the DTO Max.
    const page = clampListPage(filters.page, 100);
    const pageSize = clampListPageSize(filters.pageSize);
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.userId) {
      conditions.push(`"userId" = ?`);
      params.push(filters.userId);
    }
    if (filters.action) {
      conditions.push(`"action" LIKE ? ESCAPE '\\'`);
      params.push(likeContains(filters.action));
    }
    if (filters.objectType) {
      conditions.push(`"objectType" = ?`);
      params.push(filters.objectType);
    }
    // Always bound the interactive window — unbounded COUNT(*) + ORDER BY on
    // OperationAuditLog pins SQLite when auditors omit dates or span years.
    // Exclusive half-open datetime bounds keep createdAt index-friendly.
    const span = resolveInteractiveDateSpan(
      filters.dateFrom,
      filters.dateTo,
      INTERACTIVE_LIST_MAX_DAYS
    );
    conditions.push(sqlDatetimeExclusiveRange('"createdAt"'));
    params.push(beijingDayRangeSqlite(span.dateFrom).start);
    params.push(beijingDayRangeSqlite(span.dateTo).end);

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const countParams = [...params];
    const countRows = await this.prisma.$queryRawUnsafe<[{ count: number }]>(
      `SELECT COUNT(*) as count FROM "OperationAuditLog" ${where}`,
      ...countParams
    );
    const total = Number(countRows[0]?.count ?? 0);

    const queryParams = [...params, pageSize, offset];
    // List never materializes before/after — detail uses findById for full row.
    const rows = await this.prisma.$queryRawUnsafe<AuditLogRow[]>(
      `SELECT ${AUDIT_LOG_LIST_COLUMNS} FROM "OperationAuditLog" ${where} ORDER BY "createdAt" DESC LIMIT ? OFFSET ?`,
      ...queryParams
    );

    const data = rows.map(this.mapRow);

    // Residual #273: project INTERACTIVE window so SPA can surface honesty.
    return {
      data,
      total,
      page,
      pageSize,
      dateFrom: span.dateFrom,
      dateTo: span.dateTo
    };
  }

  /**
   * Get a single audit log by logId.
   */
  async findById(logId: string) {
    const rows = await this.prisma.$queryRawUnsafe<AuditLogRow[]>(
      `SELECT ${AUDIT_LOG_ROW_COLUMNS} FROM "OperationAuditLog" WHERE "logId" = ?`,
      logId
    );
    if (!rows[0]) return null;
    return this.mapRow(rows[0]);
  }

  /**
   * Get audit log trajectory history for a specific entity.
   */
  async listByEntity(objectType: string, objectId: string, page = 1, pageSize = 20) {
    const p = clampListPage(page, 100);
    const ps = clampListPageSize(pageSize);
    const offset = (p - 1) * ps;

    const countRows = await this.prisma.$queryRawUnsafe<[{ count: number }]>(
      `SELECT COUNT(*) as count FROM "OperationAuditLog" WHERE "objectType" = ? AND "objectId" = ?`,
      objectType,
      objectId
    );
    const total = Number(countRows[0]?.count ?? 0);

    const rows = await this.prisma.$queryRawUnsafe<AuditLogRow[]>(
      `SELECT ${AUDIT_LOG_ROW_COLUMNS} FROM "OperationAuditLog"
       WHERE "objectType" = ? AND "objectId" = ?
       ORDER BY "createdAt" DESC LIMIT ? OFFSET ?`,
      objectType,
      objectId,
      ps,
      offset
    );

    return {
      data: rows.map(this.mapRow),
      total,
      page: p,
      pageSize: ps
    };
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
