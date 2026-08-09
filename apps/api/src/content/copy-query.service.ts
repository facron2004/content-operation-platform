import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AuditStatus, Channel, CopiesResponse, GeneratedCopy } from '@content/shared';
import { beijingDateKey, resolvePagination, shiftDateKey } from '@content/shared';
import { INTERACTIVE_LIST_MAX_DAYS } from '../common/list-date-span';
import { PrismaService } from '../prisma/prisma.service';
import { COPY_LIST_SELECT, mapCopy } from './mappers';

export type CopyListFilters = {
  auditStatus?: AuditStatus;
  channel?: Channel;
  areaIds?: string[];
  merchantIds?: string[];
};

@Injectable()
export class CopyQueryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listCopies(
    filters: CopyListFilters,
    page?: number,
    pageSize?: number
  ): Promise<CopiesResponse> {
    const { offset, ...pagination } = resolvePagination(page, pageSize, 0);

    // Residual #166: filter GeneratedCopy denorm areaId/merchantId directly —
    // drop ContentPackage relation join. Denorm columns are stamped at generate
    // and indexed (@@index([areaId])); OR-of-IN still ≤ MAX_SCOPE_IDS=200.
    // Avoid materializing packageId IN (...) capped by PLATFORM_SCAN_LIMIT.
    const areaIds = filters.areaIds?.length ? filters.areaIds.slice(0, 200) : undefined;
    const merchantIds = filters.merchantIds?.length ? filters.merchantIds.slice(0, 200) : undefined;
    const geoScope =
      areaIds?.length || merchantIds?.length
        ? {
            OR: [
              ...(areaIds?.length ? [{ areaId: { in: areaIds } }] : []),
              ...(merchantIds?.length ? [{ merchantId: { in: merchantIds } }] : [])
            ]
          }
        : {};

    // Cap interactive copy list at trailing 90d — unbounded COUNT + ORDER BY on
    // GeneratedCopy pins SQLite as history accumulates (parity with audit/task lists).
    const dateTo = beijingDateKey(new Date());
    const dateFrom = shiftDateKey(dateTo, -(INTERACTIVE_LIST_MAX_DAYS - 1));
    const createdAtWindow = {
      gte: new Date(`${dateFrom}T00:00:00+08:00`),
      lt: new Date(new Date(`${dateTo}T00:00:00+08:00`).getTime() + 24 * 3600 * 1000)
    };

    const where = {
      auditStatus: filters.auditStatus,
      channel: filters.channel,
      createdAt: createdAtWindow,
      ...geoScope
    };

    const [rows, total] = await Promise.all([
      this.prisma.generatedCopy.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: pagination.pageSize,
        // List omits body/cta blobs — audit/detail loads full row via getCopy.
        select: COPY_LIST_SELECT
      }),
      this.prisma.generatedCopy.count({ where })
    ]);

    // 拿到真实 total 后重新计算 totalPages
    const finalPagination = resolvePagination(page, pageSize, total);
    return {
      items: rows.map(mapCopy),
      pagination: {
        page: finalPagination.page,
        pageSize: finalPagination.pageSize,
        total,
        totalPages: finalPagination.totalPages,
        dateFrom,
        dateTo
      }
    };
  }

  /** Full copy (incl. body/cta) for audit editor / detail panel. */
  async getCopy(contentId: string): Promise<GeneratedCopy> {
    const row = await this.prisma.generatedCopy.findUnique({ where: { contentId } });
    if (!row) throw new NotFoundException('文案不存在');
    return mapCopy(row);
  }

  // Residual #119: removed dead getCopyPackageId — controllers use getCopy.packageId
  // for scope (#104 detail / #114 audit). No remaining callers.
}
