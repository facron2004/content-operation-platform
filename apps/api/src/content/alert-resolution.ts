import { BadRequestException } from '@nestjs/common';
import { ALERT_TYPES } from '@content/shared';
import { PrismaService } from '../prisma/prisma.service';
import { safePathId } from '../common/path-id';
import { toSqliteDateTime } from '../common/sqlite-datetime';
import { RESOLVED_ALERT_DAY_LIMIT } from '../common/sql-chunk';

const ALERT_TYPE_SET = new Set<string>(ALERT_TYPES);
const RESOLVE_BATCH_MAX = 200;
const RESOLVE_INSERT_CHUNK = 50;

// 保留旧 Prisma client 不含 OperationAlertResolution model 时的 raw SQL fallback。
const ALERT_UPSERT_SQL = `
  INSERT INTO "OperationAlertResolution" ("alertId", "resolvedDate", "resolvedBy", "resolvedAt")
  VALUES (?, ?, ?, ?)
  ON CONFLICT("alertId", "resolvedDate") DO UPDATE SET
    "resolvedBy" = excluded."resolvedBy",
    "resolvedAt" = excluded."resolvedAt"`;

export type ResolvedAlertIds = {
  ids: Set<string>;
  truncated: boolean;
  limit: number;
  loaded: number;
};

/** alertId is `${packageId}:${type}`; reject free-form resolution keys. */
export function normalizeAlertId(raw: string): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) throw new BadRequestException('alertId 必填');
  const sep = value.lastIndexOf(':');
  if (sep <= 0 || sep === value.length - 1) {
    throw new BadRequestException('alertId 格式无效，期望 packageId:type');
  }
  const packageId = safePathId(value.slice(0, sep));
  const type = value.slice(sep + 1).trim();
  if (!packageId || !ALERT_TYPE_SET.has(type)) {
    throw new BadRequestException('alertId 格式无效，期望 packageId:type');
  }
  return `${packageId}:${type}`;
}

export async function resolveOperationAlert(
  prisma: PrismaService,
  alertId: string,
  resolvedBy: string,
  resolvedDate: string
) {
  const normalized = normalizeAlertId(alertId);
  await upsertResolution(prisma, normalized, resolvedDate, resolvedBy);
  return { success: true, alertId: normalized, resolvedDate, message: '预警已标记为已处理' };
}

export async function resolveOperationAlerts(
  prisma: PrismaService,
  alertIds: string[],
  resolvedBy: string,
  resolvedDate: string
) {
  const uniqueAlertIds = [
    ...new Set(
      (alertIds ?? [])
        .map((id) => {
          try {
            return normalizeAlertId(id);
          } catch {
            return '';
          }
        })
        .filter(Boolean)
    )
  ].slice(0, RESOLVE_BATCH_MAX);
  if (!uniqueAlertIds.length) throw new BadRequestException('alertIds 不能为空或格式无效');

  // 4 cols × 50 = 200 params; keep one interactive transaction for atomicity.
  const resolvedAt = toSqliteDateTime();
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < uniqueAlertIds.length; i += RESOLVE_INSERT_CHUNK) {
      const slice = uniqueAlertIds.slice(i, i + RESOLVE_INSERT_CHUNK);
      const valueClauses = slice.map(() => '(?, ?, ?, ?)').join(', ');
      const params: unknown[] = [];
      for (const alertId of slice) {
        params.push(alertId, resolvedDate, resolvedBy, resolvedAt);
      }
      await tx.$executeRawUnsafe(
        `INSERT INTO "OperationAlertResolution" ("alertId", "resolvedDate", "resolvedBy", "resolvedAt")
         VALUES ${valueClauses}
         ON CONFLICT("alertId", "resolvedDate") DO UPDATE SET
           "resolvedBy" = excluded."resolvedBy",
           "resolvedAt" = excluded."resolvedAt"`,
        ...params
      );
    }
  });
  return {
    success: true,
    alertIds: uniqueAlertIds,
    resolvedCount: uniqueAlertIds.length,
    resolvedDate,
    message: '预警已标记为已处理'
  };
}

/** Return a Prisma promise when available, with a raw-SQL fallback for older clients. */
function upsertResolution(
  prisma: PrismaService,
  alertId: string,
  resolvedDate: string,
  resolvedBy: string
) {
  const resolvedAt = new Date();
  if (prisma.operationAlertResolution) {
    return prisma.operationAlertResolution.upsert({
      where: { alertId_resolvedDate: { alertId, resolvedDate } },
      update: { resolvedBy, resolvedAt },
      create: { alertId, resolvedDate, resolvedBy, resolvedAt }
    });
  }
  return prisma.$executeRawUnsafe(
    ALERT_UPSERT_SQL,
    alertId,
    resolvedDate,
    resolvedBy,
    toSqliteDateTime(resolvedAt)
  );
}

/** Load a deterministic bounded head and expose whether the daily cap clipped it. */
export async function loadResolvedAlertIds(
  prisma: PrismaService,
  dateKey: string
): Promise<ResolvedAlertIds> {
  const limit = RESOLVED_ALERT_DAY_LIMIT;
  if (prisma.operationAlertResolution) {
    const rows = await prisma.operationAlertResolution.findMany({
      where: { resolvedDate: dateKey },
      select: { alertId: true },
      orderBy: { resolvedAt: 'asc' },
      take: limit + 1
    });
    return toResolvedAlertIds(rows, limit);
  }
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT "alertId" FROM "OperationAlertResolution" WHERE "resolvedDate" = ? ORDER BY "resolvedAt" ASC LIMIT ?`,
    dateKey,
    limit + 1
  )) as Array<{ alertId: string }>;
  return toResolvedAlertIds(rows, limit);
}

function toResolvedAlertIds(rows: Array<{ alertId: string }>, limit: number): ResolvedAlertIds {
  const truncated = rows.length > limit;
  const kept = truncated ? rows.slice(0, limit) : rows;
  return {
    ids: new Set(kept.map((row) => row.alertId)),
    truncated,
    limit,
    loaded: kept.length
  };
}
