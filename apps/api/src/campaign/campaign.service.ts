import { Inject, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { beijingDateKey, shiftDateKey, yuanToFen } from '@content/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { CampaignQueryDto } from './dto/campaign-query.dto';
import { jsonArrayIdLike, likeContains } from '../common/like-escape';
import { newEntityId } from '../common/id';
import {
  beijingDayRangeSqlite,
  sqlDatetimeExclusiveRange,
  toSqliteDateTime
} from '../common/sqlite-datetime';
import { INTERACTIVE_LIST_MAX_DAYS, resolveInteractiveDateSpan } from '../common/list-date-span';
import { clampListPage, clampListPageSize } from '../common/sql-chunk';

interface CampaignRow {
  campaignId: string;
  name: string;
  description: string | null;
  campaignType: string;
  status: string;
  startDate: string;
  endDate: string;
  areaIds: string | null;
  merchantIds: string | null;
  budget: number;
  targetGmv: number;
  targetOrders: number;
  kpiJson: string | null;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
}

const CAMPAIGN_ROW_COLUMNS = `"campaignId", "name", "description", "campaignType", "status",
  "startDate", "endDate", "areaIds", "merchantIds", "budget", "targetGmv",
  "targetOrders", "kpiJson", "ownerId", "createdAt", "updatedAt"`;

function safeJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function safeJsonObject(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseCampaign(row: CampaignRow) {
  return {
    ...row,
    areaIds: safeJsonArray(row.areaIds),
    merchantIds: safeJsonArray(row.merchantIds),
    kpiJson: safeJsonObject(row.kpiJson),
    description: row.description ?? undefined,
    ownerId: row.ownerId ?? undefined
  };
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['active', 'cancelled'],
  active: ['paused', 'completed', 'cancelled'],
  paused: ['active', 'cancelled'],
  completed: [],
  cancelled: []
};

@Injectable()
export class CampaignService {
  private readonly logger = new Logger(CampaignService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(
    query: CampaignQueryDto,
    scope?: { unrestricted: boolean; areaIds: string[]; merchantIds: string[] }
  ) {
    // Defense-in-depth: DTO Max may be bypassed if pipe is misconfigured.
    const page = clampListPage(query.page, 100);
    const pageSize = clampListPageSize(query.pageSize);
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.status) {
      conditions.push('"status" = ?');
      params.push(query.status);
    }
    // Residual #192: honor SPA CampaignFilterBar campaignType.
    if (query.campaignType) {
      conditions.push('"campaignType" = ?');
      params.push(query.campaignType);
    }
    // Bound free-form startDate windows (max 90d inclusive). When neither bound is
    // provided, skip date filter so future-dated drafts still appear in the default
    // list — MarketingCampaign is small and already paginated.
    // Residual #276: capture effective span so one-sided filters surface honesty.
    let effectiveSpan: { dateFrom: string; dateTo: string } | undefined;
    if (query.startDateFrom || query.startDateTo) {
      effectiveSpan = resolveInteractiveDateSpan(
        query.startDateFrom,
        query.startDateTo,
        INTERACTIVE_LIST_MAX_DAYS
      );
      conditions.push('"startDate" >= ?');
      params.push(effectiveSpan.dateFrom);
      conditions.push('"startDate" <= ?');
      params.push(effectiveSpan.dateTo);
    }
    if (query.keyword) {
      conditions.push(`"name" LIKE ? ESCAPE '\\'`);
      params.push(likeContains(query.keyword));
    }

    // Scoped operators only see campaigns that explicitly bind their area/merchant.
    // Platform-wide campaigns (empty areaIds+merchantIds) stay unrestricted-only.
    // JSON-array columns are matched as quoted tokens with ESCAPE so wildcard chars
    // in ids cannot broaden the match (SQLite stores e.g. ["a1","a2"]).
    if (scope && !scope.unrestricted) {
      const scopeParts: string[] = [];
      for (const areaId of scope.areaIds) {
        const m = jsonArrayIdLike('"areaIds"', areaId);
        if (m) {
          scopeParts.push(m.sql);
          params.push(m.param);
        }
      }
      for (const merchantId of scope.merchantIds) {
        const m = jsonArrayIdLike('"merchantIds"', merchantId);
        if (m) {
          scopeParts.push(m.sql);
          params.push(m.param);
        }
      }
      if (!scopeParts.length) {
        return {
          items: [],
          total: 0,
          page,
          pageSize,
          // Residual #276: still project effective span when date filter was applied.
          ...(effectiveSpan
            ? { startDateFrom: effectiveSpan.dateFrom, startDateTo: effectiveSpan.dateTo }
            : {})
        };
      }
      conditions.push(`(${scopeParts.join(' OR ')})`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.prisma.$queryRawUnsafe<[{ cnt: number }]>(
      `SELECT COUNT(*) as cnt FROM "MarketingCampaign" ${where}`,
      ...params
    );
    const total = Number(countResult[0].cnt);

    params.push(pageSize, (page - 1) * pageSize);
    const rows = await this.prisma.$queryRawUnsafe<CampaignRow[]>(
      `SELECT ${CAMPAIGN_ROW_COLUMNS} FROM "MarketingCampaign" ${where} ORDER BY "createdAt" DESC LIMIT ? OFFSET ?`,
      ...params
    );

    return {
      items: rows.map(parseCampaign),
      total,
      page,
      pageSize,
      // Residual #276: INTERACTIVE_LIST_MAX_DAYS effective startDate window honesty.
      ...(effectiveSpan
        ? { startDateFrom: effectiveSpan.dateFrom, startDateTo: effectiveSpan.dateTo }
        : {})
    };
  }

  async getById(id: string) {
    const rows = await this.prisma.$queryRawUnsafe<CampaignRow[]>(
      `SELECT ${CAMPAIGN_ROW_COLUMNS} FROM "MarketingCampaign" WHERE "campaignId" = ?`,
      id
    );
    if (rows.length === 0) throw new NotFoundException('Campaign not found');
    return parseCampaign(rows[0]);
  }

  /**
   * Residual #113/#155: controller access probe.
   * areaIds+merchantIds for scope asserts; status so transitionStatus can skip a
   * second SELECT (parity with DT #151 getTaskAccessMeta). Mutates never need
   * description/kpiJson/budget just to gate access.
   */
  /**
   * Residual #113/#155: scope arrays + status for access + transition preload.
   * Residual #158: also startDate/endDate so update freeze can skip a second SELECT.
   */
  async getCampaignScope(id: string): Promise<{
    areaIds: string[];
    merchantIds: string[];
    status: string;
    startDate: string;
    endDate: string;
  }> {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        areaIds: string | null;
        merchantIds: string | null;
        status: string;
        startDate: string;
        endDate: string;
      }>
    >(
      `SELECT "areaIds", "merchantIds", "status", "startDate", "endDate" FROM "MarketingCampaign" WHERE "campaignId" = ?`,
      id
    );
    if (rows.length === 0) throw new NotFoundException('Campaign not found');
    return {
      areaIds: safeJsonArray(rows[0].areaIds),
      merchantIds: safeJsonArray(rows[0].merchantIds),
      status: rows[0].status,
      startDate: rows[0].startDate,
      endDate: rows[0].endDate
    };
  }

  async create(dto: CreateCampaignDto & { ownerId?: string }) {
    if (dto.startDate && dto.endDate && dto.startDate > dto.endDate) {
      throw new BadRequestException('startDate 必须 ≤ endDate');
    }
    await this.assertScopeIdsExist(dto.areaIds, dto.merchantIds);
    const campaignId = this.generateId();
    const now = toSqliteDateTime();
    const description = dto.description ?? null;
    const areaIdsJson = dto.areaIds ? JSON.stringify(dto.areaIds) : null;
    const merchantIdsJson = dto.merchantIds ? JSON.stringify(dto.merchantIds) : null;
    const budget = dto.budget ?? 0;
    const targetGmv = dto.targetGmv ?? 0;
    const targetOrders = dto.targetOrders ?? 0;
    // ownerId only from controller JWT stamp (not free-form DTO field).
    const ownerId = dto.ownerId ?? null;
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "MarketingCampaign" ("campaignId", "name", "description", "campaignType", "status", "startDate", "endDate", "areaIds", "merchantIds", "budget", "targetGmv", "budgetFen", "targetGmvFen", "targetOrders", "ownerId", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      campaignId,
      dto.name,
      description,
      dto.campaignType,
      dto.startDate,
      dto.endDate,
      areaIdsJson,
      merchantIdsJson,
      budget,
      targetGmv,
      yuanToFen(budget),
      yuanToFen(targetGmv),
      targetOrders,
      ownerId,
      now,
      now
    );
    // Residual #171: SPA form create discards body and reloads list — slim shell
    // is enough (parity with #164 update / #170 user create). No parseCampaign
    // synthesis of unused free-form fields.
    return {
      success: true as const,
      campaignId,
      status: 'draft' as const
    };
  }

  async update(
    id: string,
    dto: UpdateCampaignDto,
    preloadedMeta?: { status: string; startDate: string; endDate: string }
  ) {
    // Residual #110: status + date bounds only — freeze/date checks never need
    // name/budget/kpiJson/areaIds JSON.
    // Residual #158: controller may pass freeze fields from getCampaignScope.
    let existing = preloadedMeta;
    if (!existing) {
      const existingRows = await this.prisma.$queryRawUnsafe<
        Array<{ status: string; startDate: string; endDate: string }>
      >(
        `SELECT "status", "startDate", "endDate" FROM "MarketingCampaign" WHERE "campaignId" = ?`,
        id
      );
      if (existingRows.length === 0) throw new NotFoundException('Campaign not found');
      existing = existingRows[0];
    }

    // Terminal campaigns are immutable (history / KPI freeze).
    if (existing.status === 'completed' || existing.status === 'cancelled') {
      throw new BadRequestException(`Cannot update campaign with status '${existing.status}'`);
    }

    const structuralFields = [
      'campaignType',
      'startDate',
      'endDate',
      'areaIds',
      'merchantIds'
    ] as const;
    const attemptedStructural = structuralFields.filter((f) => dto[f] !== undefined);

    // On active/paused, freeze structural scope + schedule so running tasks cannot
    // be retargeted to a different area/merchant window mid-flight.
    if (
      (existing.status === 'active' || existing.status === 'paused') &&
      attemptedStructural.length
    ) {
      throw new BadRequestException(
        `活动状态为 '${existing.status}'，不可修改: ${attemptedStructural.join(', ')}`
      );
    }

    // Draft structural freeze is pinned into the UPDATE via NOT EXISTS (historyGuard).
    // Residual #103: no happy-path pre-COUNT — failure arm still calls
    // assertNoTaskHistoryWhenRewritingScope to distinguish status race vs history.

    const nextStart = dto.startDate ?? existing.startDate;
    const nextEnd = dto.endDate ?? existing.endDate;
    if (nextStart && nextEnd && nextStart > nextEnd) {
      throw new BadRequestException('startDate 必须 ≤ endDate');
    }
    // Validate only when the client is rewriting scope lists.
    if (dto.areaIds !== undefined || dto.merchantIds !== undefined) {
      await this.assertScopeIdsExist(
        dto.areaIds !== undefined ? dto.areaIds : undefined,
        dto.merchantIds !== undefined ? dto.merchantIds : undefined
      );
    }

    const sets: string[] = [];
    const params: unknown[] = [];

    if (dto.name !== undefined) {
      sets.push('"name" = ?');
      params.push(dto.name);
    }
    if (dto.description !== undefined) {
      sets.push('"description" = ?');
      params.push(dto.description ?? null);
    }
    if (dto.campaignType !== undefined) {
      sets.push('"campaignType" = ?');
      params.push(dto.campaignType);
    }
    if (dto.startDate !== undefined) {
      sets.push('"startDate" = ?');
      params.push(dto.startDate);
    }
    if (dto.endDate !== undefined) {
      sets.push('"endDate" = ?');
      params.push(dto.endDate);
    }
    if (dto.areaIds !== undefined) {
      sets.push('"areaIds" = ?');
      params.push(JSON.stringify(dto.areaIds));
    }
    if (dto.merchantIds !== undefined) {
      sets.push('"merchantIds" = ?');
      params.push(JSON.stringify(dto.merchantIds));
    }
    if (dto.budget !== undefined) {
      sets.push('"budget" = ?');
      params.push(dto.budget);
      sets.push('"budgetFen" = ?');
      params.push(yuanToFen(dto.budget));
    }
    if (dto.targetGmv !== undefined) {
      sets.push('"targetGmv" = ?');
      params.push(dto.targetGmv);
      sets.push('"targetGmvFen" = ?');
      params.push(yuanToFen(dto.targetGmv));
    }
    if (dto.targetOrders !== undefined) {
      sets.push('"targetOrders" = ?');
      params.push(dto.targetOrders);
    }
    // ownerId is immutable after create (JWT-stamped); ignore any residual body field.

    // Residual #153: empty PATCH — freeze pre-probe already proved existence.
    // SPA form discards body + reloads list; skip full getById re-SELECT.
    if (sets.length === 0) {
      return {
        success: true as const,
        campaignId: id,
        status: existing.status,
        startDate: existing.startDate,
        endDate: existing.endDate
      };
    }

    sets.push('"updatedAt" = ?');
    params.push(toSqliteDateTime());
    // Pin status so concurrent start/pause cannot lose the structural freeze (TOCTOU).
    params.push(id, existing.status);

    // When rewriting structural scope on draft, also pin task-history freeze into
    // the UPDATE so a concurrent task create cannot land between COUNT and write.
    const pinTaskHistory = attemptedStructural.length > 0 && existing.status === 'draft';
    const historyGuard = pinTaskHistory
      ? ` AND NOT EXISTS (SELECT 1 FROM "DistributionTask" WHERE "campaignId" = ?)`
      : '';
    if (pinTaskHistory) params.push(id);

    // Residual #164: SPA form discards body + reloads list — drop the full-row
    // response payload; changed-rows is the existence/freeze probe (parity with #163).
    // transitionStatus still hydrates the full row for SPA #124 detail body reuse.
    const changed = Number(
      (await this.prisma.$executeRawUnsafe(
        `UPDATE "MarketingCampaign" SET ${sets.join(', ')}
         WHERE "campaignId" = ? AND "status" = ?${historyGuard}`,
        ...params
      )) ?? 0
    );
    if (changed <= 0) {
      // Residual #110: status-only re-probe for freeze error messages.
      const latestRows = await this.prisma.$queryRawUnsafe<Array<{ status: string }>>(
        `SELECT "status" FROM "MarketingCampaign" WHERE "campaignId" = ?`,
        id
      );
      if (latestRows.length === 0) throw new NotFoundException('Campaign not found');
      const latestStatus = latestRows[0].status;
      if (latestStatus === 'completed' || latestStatus === 'cancelled') {
        throw new BadRequestException(`Cannot update campaign with status '${latestStatus}'`);
      }
      if (latestStatus === 'active' || latestStatus === 'paused') {
        const frozen = ['campaignType', 'startDate', 'endDate', 'areaIds', 'merchantIds'] as const;
        const attempted = frozen.filter((f) => dto[f] !== undefined);
        if (attempted.length) {
          throw new BadRequestException(
            `活动状态为 '${latestStatus}'，不可修改: ${attempted.join(', ')}`
          );
        }
      }
      if (pinTaskHistory && attemptedStructural.length) {
        // Distinguish status race vs task-history race for operators.
        await this.assertNoTaskHistoryWhenRewritingScope(id);
      }
      throw new BadRequestException(`活动状态已变更（当前 '${latestStatus}'），请刷新后重试`);
    }
    return {
      success: true as const,
      campaignId: id,
      status: existing.status,
      startDate: dto.startDate ?? existing.startDate,
      endDate: dto.endDate ?? existing.endDate
    };
  }

  async delete(id: string) {
    // Conditional DELETE: only succeed when NO distribution task history references
    // the campaign (including terminal). Terminal tasks still join campaign KPI /
    // performance boards — deleting would orphan TPD history. NOT EXISTS pins the
    // concurrent create race (parity with CommunityGroup delete).
    // Residual #101: drop pre-getById — failure arm already distinguishes missing vs
    // blocked with a narrow SELECT; happy path was paying a full-row read for nothing.
    const changed = Number(
      (await this.prisma.$executeRawUnsafe(
        `DELETE FROM "MarketingCampaign"
         WHERE "campaignId" = ?
           AND NOT EXISTS (
             SELECT 1 FROM "DistributionTask"
             WHERE "campaignId" = ?
           )`,
        id,
        id
      )) ?? 0
    );
    if (changed <= 0) {
      // Distinguish missing row vs task-history block.
      const stillThere = await this.prisma.$queryRawUnsafe<Array<{ campaignId: string }>>(
        `SELECT "campaignId" FROM "MarketingCampaign" WHERE "campaignId" = ? LIMIT 1`,
        id
      );
      if (!stillThere.length) {
        throw new NotFoundException(`活动不存在: ${id}`);
      }
      throw new BadRequestException(
        'Cannot delete campaign with distribution task history; cancel/archive tasks first'
      );
    }
    return { success: true };
  }

  async transitionStatus(id: string, targetStatus: string, preloadedStatus?: string) {
    // Residual #106/#155: status for allowed map + pin. Controller getCampaignScope
    // already paid the probe (includes status) — accept preloadedStatus to skip the
    // second SELECT on the happy path. Failure arm still re-probes status.
    let currentStatus = preloadedStatus;
    if (currentStatus === undefined) {
      const statusRows = await this.prisma.$queryRawUnsafe<Array<{ status: string }>>(
        `SELECT "status" FROM "MarketingCampaign" WHERE "campaignId" = ?`,
        id
      );
      if (statusRows.length === 0) throw new NotFoundException('Campaign not found');
      currentStatus = statusRows[0].status;
    }
    const allowed = VALID_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(targetStatus)) {
      throw new BadRequestException(
        `Cannot transition from '${currentStatus}' to '${targetStatus}'. Allowed: ${allowed.join(', ')}`
      );
    }
    // Conditional update closes TOCTOU: concurrent start/pause/cancel cannot both win.
    // Residual #139: UPDATE ... RETURNING hydrates the full campaign row for SPA #124
    // body reuse — drop the post-write getById.
    const returned = await this.prisma.$queryRawUnsafe<CampaignRow[]>(
      `UPDATE "MarketingCampaign" SET "status" = ?, "updatedAt" = ?
       WHERE "campaignId" = ? AND "status" = ?
       RETURNING ${CAMPAIGN_ROW_COLUMNS}`,
      targetStatus,
      toSqliteDateTime(),
      id,
      currentStatus
    );
    if (!returned.length) {
      // Status-only re-probe for the error message; preserve NotFound if row vanished.
      const latestRows = await this.prisma.$queryRawUnsafe<Array<{ status: string }>>(
        `SELECT "status" FROM "MarketingCampaign" WHERE "campaignId" = ?`,
        id
      );
      if (latestRows.length === 0) throw new NotFoundException('Campaign not found');
      const latestStatus = latestRows[0].status;
      throw new BadRequestException(
        `Cannot transition from '${latestStatus}' to '${targetStatus}'. Allowed: ${(VALID_TRANSITIONS[latestStatus] ?? []).join(', ')}`
      );
    }
    return parseCampaign(returned[0]);
  }

  async getPerformance(id: string) {
    // Residual #105: controller already getById for scope; aggregates do not need
    // the parent row. Missing id yields zero totals (same as empty task history).

    // Cap task status counts + TPD fan-out at interactive 90d — parity with
    // community getPerformance. Unbounded COUNT/SUM over all campaign history
    // pins SQLite as tenants age. Exclusive datetime bounds keep createdAt
    // index-friendly.
    const dateTo = beijingDateKey(new Date());
    const dateFrom = shiftDateKey(dateTo, -(INTERACTIVE_LIST_MAX_DAYS - 1));
    const createdStart = beijingDayRangeSqlite(dateFrom).start;
    const createdEnd = beijingDayRangeSqlite(dateTo).end;

    const rows = await this.prisma.$queryRawUnsafe<
      [
        {
          totalTasks: number;
          completedTasks: number;
          failedTasks: number;
        }
      ]
    >(
      `SELECT
         COUNT(*) as totalTasks,
         COALESCE(SUM(CASE WHEN "status" = 'completed' THEN 1 ELSE 0 END), 0) as completedTasks,
         COALESCE(SUM(CASE WHEN "status" = 'failed' THEN 1 ELSE 0 END), 0) as failedTasks
       FROM "DistributionTask"
       WHERE "campaignId" = ?
         AND ${sqlDatetimeExclusiveRange('"createdAt"')}`,
      id,
      createdStart,
      createdEnd
    );

    // GMV + orderCount live on TaskPerformanceDaily, not DistributionTask.
    const perfRow = await this.prisma.$queryRawUnsafe<[{ totalGmv: number; totalOrders: number }]>(
      `SELECT
         COALESCE(SUM("gmv"), 0) as totalGmv,
         COALESCE(SUM("orderCount"), 0) as totalOrders
       FROM "TaskPerformanceDaily"
       WHERE "taskId" IN (
         SELECT "taskId" FROM "DistributionTask"
         WHERE "campaignId" = ?
           AND ${sqlDatetimeExclusiveRange('"createdAt"')}
       )
         AND "date" >= ? AND "date" <= ?`,
      id,
      createdStart,
      createdEnd,
      dateFrom,
      dateTo
    );

    const r = rows[0];
    return {
      totalTasks: Number(r.totalTasks),
      completedTasks: Number(r.completedTasks),
      failedTasks: Number(r.failedTasks),
      totalGmv: Number(perfRow[0].totalGmv),
      totalOrders: Number(perfRow[0].totalOrders),
      dateFrom,
      dateTo
    };
  }

  /**
   * Reject phantom area/merchant scope ids so campaign windows cannot be
   * planted against non-existent geography (would empty task bind coverage).
   * - merchant: Merchant.merchantId (one IN query ≤200)
   * - area: observed via Merchant.areaId OR ContentPackage.areaId (two IN queries ≤100)
   */
  private async assertScopeIdsExist(
    areaIds?: string[] | null,
    merchantIds?: string[] | null
  ): Promise<void> {
    if (merchantIds?.length) {
      const ids = [
        ...new Set(
          merchantIds
            .slice(0, 200)
            .map((raw) => String(raw ?? '').trim())
            .filter(Boolean)
        )
      ];
      if (ids.length) {
        const ph = ids.map(() => '?').join(',');
        const rows = await this.prisma.$queryRawUnsafe<Array<{ merchantId: string }>>(
          `SELECT "merchantId" FROM "Merchant" WHERE "merchantId" IN (${ph})`,
          ...ids
        );
        const found = new Set(rows.map((r) => r.merchantId));
        for (const id of ids) {
          if (!found.has(id)) {
            throw new BadRequestException(`活动商家 scopeId 不存在: ${id}`);
          }
        }
      }
    }
    if (areaIds?.length) {
      const ids = [
        ...new Set(
          areaIds
            .slice(0, 100)
            .map((raw) => String(raw ?? '').trim())
            .filter(Boolean)
        )
      ];
      if (ids.length) {
        const ph = ids.map(() => '?').join(',');
        const [merchantAreas, pkgAreas] = await Promise.all([
          this.prisma.$queryRawUnsafe<Array<{ areaId: string }>>(
            `SELECT DISTINCT "areaId" FROM "Merchant" WHERE "areaId" IN (${ph})`,
            ...ids
          ),
          this.prisma.$queryRawUnsafe<Array<{ areaId: string }>>(
            `SELECT DISTINCT "areaId" FROM "ContentPackage" WHERE "areaId" IN (${ph})`,
            ...ids
          )
        ]);
        const found = new Set([
          ...merchantAreas.map((r) => r.areaId),
          ...pkgAreas.map((r) => r.areaId)
        ]);
        for (const id of ids) {
          if (!found.has(id)) {
            throw new BadRequestException(`活动区域 scopeId 不存在: ${id}`);
          }
        }
      }
    }
  }

  /**
   * Failure-arm probe: ANY DistributionTask reference freezes structural scope.
   * Residual #103: SELECT 1 LIMIT 1 (not COUNT) — only called when conditional
   * UPDATE with NOT EXISTS returned 0 rows.
   */
  private async assertNoTaskHistoryWhenRewritingScope(campaignId: string): Promise<void> {
    const history = await this.prisma.$queryRawUnsafe<Array<{ taskId: string }>>(
      `SELECT "taskId" FROM "DistributionTask" WHERE "campaignId" = ? LIMIT 1`,
      campaignId
    );
    if (history.length > 0) {
      throw new BadRequestException(
        '活动已有分发任务历史，不可修改区域/商家/档期；请新建活动或保持原范围'
      );
    }
  }

  private generateId(): string {
    return newEntityId('cmp');
  }
}
