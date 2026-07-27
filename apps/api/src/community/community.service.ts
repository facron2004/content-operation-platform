import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { beijingDateKey, shiftDateKey } from '@content/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommunityDto } from './dto/create-community.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';
import { CommunityQueryDto } from './dto/community-query.dto';
import { likeContains } from '../common/like-escape';
import { newEntityId } from '../common/id';
import {
  beijingDayRangeSqlite,
  sqlDatetimeExclusiveRange,
  toSqliteDateTime
} from '../common/sqlite-datetime';
import { INTERACTIVE_LIST_MAX_DAYS } from '../common/list-date-span';
import { maskPhone } from '../common/mask-pii';
import { clampListPage, clampListPageSize } from '../common/sql-chunk';
import {
  parseTask,
  TASK_LIST_ROW_COLUMNS,
  type TaskRow
} from '../distribution-task/distribution-task-query';

interface CommunityRow {
  groupId: string;
  groupName: string;
  groupType: string;
  areaId: string;
  areaName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  memberCount: number;
  activityLevel: string | null;
  tags: string | null;
  preferredCategories: string | null;
  preferredTimeSlots: string | null;
  isActive: number;
  source: string | null;
  lastActiveAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

const COMMUNITY_ROW_COLUMNS = `"groupId", "groupName", "groupType", "areaId", "areaName",
  "ownerId", "ownerName", "ownerPhone", "memberCount", "activityLevel", "tags",
  "preferredCategories", "preferredTimeSlots", "isActive", "source", "lastActiveAt",
  "note", "createdAt", "updatedAt"`;

function safeJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseCommunity(row: CommunityRow) {
  return {
    ...row,
    tags: safeJsonArray(row.tags),
    preferredCategories: safeJsonArray(row.preferredCategories),
    isActive: Boolean(row.isActive),
    areaName: row.areaName ?? undefined,
    ownerId: row.ownerId ?? undefined,
    ownerName: row.ownerName ?? undefined,
    // Never return raw ownerPhone to clients (PII); keep last-4 for ops matching.
    ownerPhone: maskPhone(row.ownerPhone),
    source: row.source ?? undefined,
    note: row.note ?? undefined
  };
}

@Injectable()
export class CommunityService {
  private readonly logger = new Logger(CommunityService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(query: CommunityQueryDto & { areaIds?: string[] }) {
    // Defense-in-depth: DTO Max may be bypassed if pipe is misconfigured.
    const page = clampListPage(query.page, 100);
    const pageSize = clampListPageSize(query.pageSize);
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.areaIds?.length) {
      // Cap IN list even if a caller bypasses DTO/scope MAX_SCOPE_IDS.
      const areaIds = query.areaIds.slice(0, 200);
      conditions.push(`"areaId" IN (${areaIds.map(() => '?').join(',')})`);
      params.push(...areaIds);
    } else if (query.areaId) {
      conditions.push('"areaId" = ?');
      params.push(query.areaId);
    }
    if (query.groupType) {
      conditions.push('"groupType" = ?');
      params.push(query.groupType);
    }
    // Residual #192: honor SPA CommunityFilterBar activityLevel.
    if (query.activityLevel) {
      conditions.push('"activityLevel" = ?');
      params.push(query.activityLevel);
    }
    if (query.isActive !== undefined) {
      conditions.push('"isActive" = ?');
      params.push(query.isActive);
    }
    if (query.keyword) {
      conditions.push(`("groupName" LIKE ? ESCAPE '\\' OR "ownerName" LIKE ? ESCAPE '\\')`);
      const kw = likeContains(query.keyword);
      params.push(kw, kw);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.prisma.$queryRawUnsafe<[{ cnt: number }]>(
      `SELECT COUNT(*) as cnt FROM "CommunityGroup" ${where}`,
      ...params
    );
    const total = Number(countResult[0].cnt);

    params.push(pageSize, (page - 1) * pageSize);
    const rows = await this.prisma.$queryRawUnsafe<CommunityRow[]>(
      `SELECT ${COMMUNITY_ROW_COLUMNS} FROM "CommunityGroup" ${where} ORDER BY "createdAt" DESC LIMIT ? OFFSET ?`,
      ...params
    );

    return {
      items: rows.map(parseCommunity),
      total,
      page,
      pageSize
    };
  }

  async getById(id: string) {
    const rows = await this.prisma.$queryRawUnsafe<CommunityRow[]>(
      `SELECT ${COMMUNITY_ROW_COLUMNS} FROM "CommunityGroup" WHERE "groupId" = ?`,
      id
    );
    if (rows.length === 0) throw new NotFoundException('Community group not found');
    return parseCommunity(rows[0]);
  }

  /**
   * Residual #112: areaId-only for controller scope asserts.
   * Mutates never need the full row just to gate access (parity with DT #108).
   */
  async getCommunityAreaId(id: string): Promise<string> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ areaId: string }>>(
      `SELECT "areaId" FROM "CommunityGroup" WHERE "groupId" = ?`,
      id
    );
    if (rows.length === 0) throw new NotFoundException('Community group not found');
    return rows[0].areaId;
  }

  async create(dto: CreateCommunityDto) {
    // Stamp owner from live AppUser when ownerId is set — free-form ids/names cannot invent operators.
    const owner = await this.resolveActiveOwner(dto.ownerId);
    await this.assertAreaExists(dto.areaId);
    const groupId = this.generateId();
    const now = toSqliteDateTime();
    const areaName = dto.areaName ?? null;
    const ownerId = owner?.userId ?? null;
    // Prefer resolved displayName; fall back to free-form ownerName only when no ownerId.
    const ownerName = owner?.displayName ?? dto.ownerName ?? null;
    const ownerPhone = dto.ownerPhone ?? null;
    const memberCount = dto.memberCount ?? 0;
    const activityLevel = dto.activityLevel ?? 'medium';
    const tagsJson = dto.tags ? JSON.stringify(dto.tags) : null;
    const preferredCategoriesJson = dto.preferredCategories
      ? JSON.stringify(dto.preferredCategories)
      : null;
    const source = dto.source ?? null;
    const note = dto.note ?? null;
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "CommunityGroup" ("groupId", "groupName", "groupType", "areaId", "areaName", "ownerId", "ownerName", "ownerPhone", "memberCount", "activityLevel", "tags", "preferredCategories", "source", "note", "isActive", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      groupId,
      dto.groupName,
      dto.groupType,
      dto.areaId,
      areaName,
      ownerId,
      ownerName,
      ownerPhone,
      memberCount,
      activityLevel,
      tagsJson,
      preferredCategoriesJson,
      source,
      note,
      now,
      now
    );
    // Residual #171: SPA create discards body and reloads list — slim shell is
    // enough (parity with #163 update / #170 user create). No parseCommunity
    // synthesis of unused free-form fields.
    return {
      success: true as const,
      groupId,
      isActive: true as const
    };
  }

  async update(id: string, dto: UpdateCommunityDto, preloadedAreaId?: string) {
    // Residual #109: areaId-only pre-load — update only compares area for the freeze pin.
    // Residual #154: controller getCommunityAreaId already paid this probe for scope —
    // accept preloadedAreaId to skip the second SELECT on the happy path.
    // Residual #153: empty-set short-circuit synthesizes shell (no full getById).
    let existingAreaId = preloadedAreaId;
    if (existingAreaId === undefined) {
      const existingAreaRows = await this.prisma.$queryRawUnsafe<Array<{ areaId: string }>>(
        `SELECT "areaId" FROM "CommunityGroup" WHERE "groupId" = ?`,
        id
      );
      if (existingAreaRows.length === 0) {
        throw new NotFoundException('Community group not found');
      }
      existingAreaId = existingAreaRows[0].areaId;
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    // True only when areaId actually changes — same-area PATCH is a no-op and
    // must not take the live-task UPDATE pin (would false-fail under live tasks).
    let areaActuallyMoving = false;

    if (dto.groupName !== undefined) {
      sets.push('"groupName" = ?');
      params.push(dto.groupName);
    }
    if (dto.groupType !== undefined) {
      sets.push('"groupType" = ?');
      params.push(dto.groupType);
    }
    if (dto.areaId !== undefined) {
      await this.assertAreaExists(dto.areaId);
      if (String(existingAreaId) !== String(dto.areaId)) {
        // Live/scheduled tasks bind community geography into attribution + KPI
        // boards. Free-form areaId rewrite would retarget package-A GMV onto
        // area-B without going through task freeze (groupId is frozen, not area).
        // Residual #103: no pre-COUNT — UPDATE NOT EXISTS is the atomic freeze;
        // failure arm maps changed<=0 to BadRequest after existence check.
        sets.push('"areaId" = ?');
        params.push(dto.areaId);
        areaActuallyMoving = true;
      }
    }
    if (dto.areaName !== undefined) {
      sets.push('"areaName" = ?');
      params.push(dto.areaName ?? null);
    }
    if (dto.ownerId !== undefined) {
      const owner = await this.resolveActiveOwner(dto.ownerId);
      sets.push('"ownerId" = ?');
      params.push(owner?.userId ?? null);
      // Pair name with resolved user; clearing ownerId also clears name unless free-form provided alone.
      sets.push('"ownerName" = ?');
      params.push(
        owner?.displayName ?? (dto.ownerName !== undefined ? (dto.ownerName ?? null) : null)
      );
    } else if (dto.ownerName !== undefined) {
      // Name-only update without rebinding ownerId (legacy free-form owner labels).
      sets.push('"ownerName" = ?');
      params.push(dto.ownerName ?? null);
    }
    if (dto.ownerPhone !== undefined) {
      sets.push('"ownerPhone" = ?');
      params.push(dto.ownerPhone ?? null);
    }
    if (dto.memberCount !== undefined) {
      sets.push('"memberCount" = ?');
      params.push(dto.memberCount);
    }
    if (dto.activityLevel !== undefined) {
      sets.push('"activityLevel" = ?');
      params.push(dto.activityLevel);
    }
    if (dto.tags !== undefined) {
      sets.push('"tags" = ?');
      params.push(JSON.stringify(dto.tags));
    }
    if (dto.preferredCategories !== undefined) {
      sets.push('"preferredCategories" = ?');
      params.push(JSON.stringify(dto.preferredCategories));
    }
    if (dto.source !== undefined) {
      sets.push('"source" = ?');
      params.push(dto.source ?? null);
    }
    if (dto.note !== undefined) {
      sets.push('"note" = ?');
      params.push(dto.note ?? null);
    }

    // Residual #153: empty PATCH — areaId pre-probe already proved existence.
    // SPA form discards body + reloads list; skip full getById re-SELECT.
    if (sets.length === 0) {
      return {
        success: true as const,
        groupId: id,
        areaId: existingAreaId
      };
    }

    sets.push('"updatedAt" = ?');
    params.push(toSqliteDateTime());
    params.push(id);

    // When areaId actually changes, pin the task-history freeze into the UPDATE
    // itself so a concurrent task create cannot land between probe and write.
    const whereExtra = areaActuallyMoving
      ? ` AND NOT EXISTS (
           SELECT 1 FROM "DistributionTask"
           WHERE "groupId" = "CommunityGroup"."groupId"
         )`
      : '';
    // Residual #163: SPA form discards body + reloads list — drop the full-row
    // response payload; changed-rows is the existence/freeze probe (parity with #162).
    const changed = Number(
      (await this.prisma.$executeRawUnsafe(
        `UPDATE "CommunityGroup" SET ${sets.join(', ')} WHERE "groupId" = ?${whereExtra}`,
        ...params
      )) ?? 0
    );
    if (changed <= 0) {
      if (areaActuallyMoving) {
        // Residual #120: existence-only probe (no full row) for freeze race arm.
        const exists = await this.prisma.$queryRawUnsafe<Array<{ groupId: string }>>(
          `SELECT "groupId" FROM "CommunityGroup" WHERE "groupId" = ?`,
          id
        );
        if (!exists.length) throw new NotFoundException(`社群不存在: ${id}`);
        throw new BadRequestException(
          '社群已有分发任务历史，不可修改 areaId；请新建社群或保持原区域'
        );
      }
      // Non-area update with zero rows → row vanished mid-flight.
      throw new NotFoundException(`社群不存在: ${id}`);
    }
    return {
      success: true as const,
      groupId: id,
      areaId: areaActuallyMoving && dto.areaId !== undefined ? dto.areaId : existingAreaId
    };
  }

  async delete(id: string) {
    // Residual #100: conditional DELETE alone is atomic (parity with campaign delete).
    // NOT EXISTS pins concurrent task-create races; the pre-COUNT was redundant.
    // Residual #101: drop pre-getById — failure arm already distinguishes missing vs blocked
    // with a narrow SELECT; happy path was paying a full-row read for nothing.
    const changed = Number(
      (await this.prisma.$executeRawUnsafe(
        `DELETE FROM "CommunityGroup"
         WHERE "groupId" = ?
           AND NOT EXISTS (SELECT 1 FROM "DistributionTask" WHERE "groupId" = ?)`,
        id,
        id
      )) ?? 0
    );
    if (changed <= 0) {
      // Distinguish missing row vs task-history block.
      const stillThere = await this.prisma.$queryRawUnsafe<Array<{ groupId: string }>>(
        `SELECT "groupId" FROM "CommunityGroup" WHERE "groupId" = ? LIMIT 1`,
        id
      );
      if (!stillThere.length) {
        throw new NotFoundException(`社群不存在: ${id}`);
      }
      throw new BadRequestException(
        'Cannot delete community with distribution tasks; disable it or reassign tasks first'
      );
    }
    return { success: true };
  }

  async import(dtos: CreateCommunityDto[]) {
    const list = Array.isArray(dtos) ? dtos : [];
    if (list.length === 0) {
      return { success: true as const, imported: 0 };
    }
    // Cap bulk import to keep a single request from thrashing SQLite writes.
    if (list.length > 200) {
      throw new BadRequestException('单次导入不能超过 200 条社群');
    }
    // Pre-validate all rows (area + owner) so a mid-batch failure does not leave a
    // partial import. Batch existence checks once — sequential N× assertAreaExists
    // + resolveActiveOwner was up to ~600 SELECTs at the 200-row import cap.
    const uniqueAreaIds = [
      ...new Set(
        list
          .map((d) => String(d.areaId ?? '').trim())
          .filter(Boolean)
          .slice(0, 200)
      )
    ];
    const uniqueOwnerIds = [
      ...new Set(
        list
          .map((d) =>
            String(d.ownerId ?? '')
              .trim()
              .slice(0, 64)
          )
          .filter(Boolean)
          .slice(0, 200)
      )
    ];
    const foundAreas = await this.loadExistingAreaIds(uniqueAreaIds);
    const ownersById = await this.loadActiveOwnersById(uniqueOwnerIds);

    const resolved: Array<{
      dto: CreateCommunityDto;
      owner: { userId: string; displayName: string } | null;
    }> = [];
    for (let i = 0; i < list.length; i++) {
      const dto = list[i];
      try {
        const areaId = String(dto.areaId ?? '').trim();
        if (!areaId) throw new BadRequestException('areaId 不能为空');
        if (!foundAreas.has(areaId)) {
          throw new BadRequestException(`区域 areaId 不存在: ${areaId}`);
        }
        let owner: { userId: string; displayName: string } | null = null;
        if (dto.ownerId != null && String(dto.ownerId).trim() !== '') {
          const ownerId = String(dto.ownerId).trim().slice(0, 64);
          const row = ownersById.get(ownerId);
          if (!row) throw new NotFoundException(`负责人用户不存在: ${ownerId}`);
          if (!row.active) {
            throw new BadRequestException(`负责人用户已停用: ${ownerId}`);
          }
          owner = { userId: row.userId, displayName: row.displayName };
        }
        resolved.push({ dto, owner });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err ?? 'validation failed');
        throw new BadRequestException(`导入第 ${i + 1} 行失败: ${msg}`);
      }
    }

    type TxClient = {
      $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
    };
    // Residual #93: multi-row INSERT chunks instead of N serial statements under
    // the import transaction (write-lock held for whole TX at the 200-row cap).
    const COMMUNITY_IMPORT_INSERT_CHUNK = 50;
    const COMMUNITY_IMPORT_COLS = 17;
    // Residual #171: SPA import discards body + reloads list — only need the
    // imported count. Skip CommunityRow synthesis / parseCommunity map entirely.
    const groupIds: string[] = resolved.map(() => this.generateId());
    const now = toSqliteDateTime();
    const run = async (tx: TxClient) => {
      for (let i = 0; i < resolved.length; i += COMMUNITY_IMPORT_INSERT_CHUNK) {
        const slice = resolved.slice(i, i + COMMUNITY_IMPORT_INSERT_CHUNK);
        const ids = groupIds.slice(i, i + COMMUNITY_IMPORT_INSERT_CHUNK);
        const valueClauses = slice
          .map(() => `(${Array.from({ length: COMMUNITY_IMPORT_COLS }, () => '?').join(', ')})`)
          .join(', ');
        const params: unknown[] = [];
        for (let j = 0; j < slice.length; j++) {
          const { dto, owner } = slice[j];
          const groupId = ids[j];
          const areaName = dto.areaName ?? null;
          const ownerId = owner?.userId ?? null;
          const ownerName = owner?.displayName ?? dto.ownerName ?? null;
          const ownerPhone = dto.ownerPhone ?? null;
          const memberCount = dto.memberCount ?? 0;
          const activityLevel = dto.activityLevel ?? 'medium';
          const tagsJson = dto.tags ? JSON.stringify(dto.tags) : null;
          const preferredCategoriesJson = dto.preferredCategories
            ? JSON.stringify(dto.preferredCategories)
            : null;
          const source = dto.source ?? null;
          const note = dto.note ?? null;
          params.push(
            groupId,
            dto.groupName,
            dto.groupType,
            dto.areaId,
            areaName,
            ownerId,
            ownerName,
            ownerPhone,
            memberCount,
            activityLevel,
            tagsJson,
            preferredCategoriesJson,
            source,
            note,
            1,
            now,
            now
          );
        }
        await tx.$executeRawUnsafe(
          `INSERT INTO "CommunityGroup" ("groupId", "groupName", "groupType", "areaId", "areaName", "ownerId", "ownerName", "ownerPhone", "memberCount", "activityLevel", "tags", "preferredCategories", "source", "note", "isActive", "createdAt", "updatedAt")
           VALUES ${valueClauses}`,
          ...params
        );
      }
    };

    const prismaTx = this.prisma as unknown as {
      $transaction?: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
      $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
    };
    if (prismaTx.$transaction) {
      await prismaTx.$transaction((tx) => run(tx as TxClient));
    } else {
      await run(prismaTx);
    }

    return { success: true as const, imported: groupIds.length };
  }

  async disable(id: string) {
    // Residual #101: no pre-getById — UPDATE changed-rows is the existence probe.
    // Residual #162: SPA confirmAndDelete discards body + reloads list — drop the
    // full-row response payload. Slim success shell is enough.
    const now = toSqliteDateTime();
    const changed = Number(
      (await this.prisma.$executeRawUnsafe(
        `UPDATE "CommunityGroup" SET "isActive" = 0, "updatedAt" = ?
         WHERE "groupId" = ?`,
        now,
        id
      )) ?? 0
    );
    if (changed <= 0) {
      throw new NotFoundException(`社群不存在: ${id}`);
    }
    return { success: true as const, groupId: id, isActive: false as const };
  }

  /**
   * Residual #199: reverse soft-disable. UpdateCommunityDto has no isActive, so
   * PATCH cannot re-enable; explicit transition mirrors disable slim shell.
   */
  async enable(id: string) {
    const now = toSqliteDateTime();
    const changed = Number(
      (await this.prisma.$executeRawUnsafe(
        `UPDATE "CommunityGroup" SET "isActive" = 1, "updatedAt" = ?
         WHERE "groupId" = ?`,
        now,
        id
      )) ?? 0
    );
    if (changed <= 0) {
      throw new NotFoundException(`社群不存在: ${id}`);
    }
    return { success: true as const, groupId: id, isActive: true as const };
  }

  async getPerformance(id: string) {
    // Residual #105: controller already getById for scope; aggregates do not need
    // the parent row. Missing id yields zero totals (same as empty task history).

    // Cap task status counts + TPD fan-out at interactive 90d — unbounded
    // COUNT/SUM over all community history pins SQLite as tenants age.
    // Exclusive datetime bounds keep createdAt index-friendly.
    const dateTo = beijingDateKey(new Date());
    const dateFrom = shiftDateKey(dateTo, -(INTERACTIVE_LIST_MAX_DAYS - 1));
    const createdStart = beijingDayRangeSqlite(dateFrom).start;
    const createdEnd = beijingDayRangeSqlite(dateTo).end;

    const rows = await this.prisma.$queryRawUnsafe<
      [{ totalTasks: number; completedTasks: number; failedTasks: number; totalGmv: number }]
    >(
      `SELECT
         COUNT(*) as totalTasks,
         COALESCE(SUM(CASE WHEN "status" = 'completed' THEN 1 ELSE 0 END), 0) as completedTasks,
         COALESCE(SUM(CASE WHEN "status" = 'failed' THEN 1 ELSE 0 END), 0) as failedTasks
       FROM "DistributionTask"
       WHERE "groupId" = ?
         AND ${sqlDatetimeExclusiveRange('"createdAt"')}`,
      id,
      createdStart,
      createdEnd
    );

    const gmvRow = await this.prisma.$queryRawUnsafe<[{ totalGmv: number }]>(
      `SELECT COALESCE(SUM("gmv"), 0) as totalGmv
       FROM "TaskPerformanceDaily"
       WHERE "taskId" IN (
         SELECT "taskId" FROM "DistributionTask"
         WHERE "groupId" = ?
           AND ${sqlDatetimeExclusiveRange('"createdAt"')}
       )
         AND "date" >= ? AND "date" <= ?`,
      id,
      createdStart,
      createdEnd,
      dateFrom,
      dateTo
    );

    return {
      totalTasks: Number(rows[0].totalTasks),
      completedTasks: Number(rows[0].completedTasks),
      failedTasks: Number(rows[0].failedTasks),
      totalGmv: Number(gmvRow[0].totalGmv),
      dateFrom,
      dateTo
    };
  }

  async getTasks(id: string, page = 1, pageSize = 20) {
    // Residual #105: controller already getById for scope; nested task list only
    // needs groupId in WHERE. Missing id yields empty page.
    // Defense-in-depth: clamp even if controller bypasses DTO Max.
    const safePage = clampListPage(page, 100);
    const safePageSize = clampListPageSize(pageSize);

    // Cap nested task history at interactive 90d — parity with global task list.
    // Unbounded COUNT + ORDER BY per community pins SQLite as history grows.
    // Exclusive datetime bounds keep createdAt index-friendly.
    const dateTo = beijingDateKey(new Date());
    const dateFrom = shiftDateKey(dateTo, -(INTERACTIVE_LIST_MAX_DAYS - 1));
    const createdStart = beijingDayRangeSqlite(dateFrom).start;
    const createdEnd = beijingDayRangeSqlite(dateTo).end;

    const countResult = await this.prisma.$queryRawUnsafe<[{ cnt: number }]>(
      `SELECT COUNT(*) as cnt FROM "DistributionTask"
       WHERE "groupId" = ?
         AND ${sqlDatetimeExclusiveRange('"createdAt"')}`,
      id,
      createdStart,
      createdEnd
    );
    const total = Number(countResult[0].cnt);

    // Same redaction as task list: live tracking codes enable unauthenticated
    // public visit spam when leaked to every authenticated role that can open
    // a community detail. Operators mint/use codes via task detail (role-gated).
    // List columns omit body/cta — same hygiene as global task list.
    const rows = await this.prisma.$queryRawUnsafe<TaskRow[]>(
      `SELECT ${TASK_LIST_ROW_COLUMNS} FROM "DistributionTask"
       WHERE "groupId" = ?
         AND ${sqlDatetimeExclusiveRange('"createdAt"')}
       ORDER BY "createdAt" DESC LIMIT ? OFFSET ?`,
      id,
      createdStart,
      createdEnd,
      safePageSize,
      (safePage - 1) * safePageSize
    );

    return {
      items: rows.map((row) => parseTask(row, { includeTrackingCode: false })),
      total,
      page: safePage,
      pageSize: safePageSize,
      dateFrom,
      dateTo
    };
  }

  /**
   * Area has no master table — accept ids observed on Merchant or ContentPackage
   * so community rows cannot invent phantom geographies for KPI boards.
   */
  private async assertAreaExists(areaId: string | null | undefined): Promise<void> {
    const id = String(areaId ?? '').trim();
    if (!id) throw new BadRequestException('areaId 不能为空');
    const found = await this.loadExistingAreaIds([id]);
    if (!found.has(id)) {
      throw new BadRequestException(`区域 areaId 不存在: ${id}`);
    }
  }

  /**
   * Batch area existence (Merchant ∪ ContentPackage). Cap 200 — parity with
   * campaign/user assertScopeIdsExist. Used by import pre-validate + single create.
   */
  private async loadExistingAreaIds(areaIds: string[]): Promise<Set<string>> {
    const found = new Set<string>();
    if (!areaIds.length) return found;
    const ids = [...new Set(areaIds.map((raw) => String(raw ?? '').trim()).filter(Boolean))].slice(
      0,
      200
    );
    if (!ids.length) return found;
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
    for (const r of merchantAreas) found.add(r.areaId);
    for (const r of pkgAreas) found.add(r.areaId);
    return found;
  }

  /**
   * Batch load active AppUser owners for import pre-validate.
   * Returns displayName resolution + active flag so callers can emit NotFound vs BadRequest.
   */
  private async loadActiveOwnersById(
    ownerIds: string[]
  ): Promise<Map<string, { userId: string; displayName: string; active: boolean }>> {
    const m = new Map<string, { userId: string; displayName: string; active: boolean }>();
    if (!ownerIds.length) return m;
    const ids = [
      ...new Set(
        ownerIds
          .map((raw) =>
            String(raw ?? '')
              .trim()
              .slice(0, 64)
          )
          .filter(Boolean)
      )
    ].slice(0, 200);
    if (!ids.length) return m;
    const ph = ids.map(() => '?').join(',');
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ userId: string; displayName: string | null; username: string; isActive: number }>
    >(
      `SELECT "userId", "displayName", "username", "isActive" FROM "AppUser" WHERE "userId" IN (${ph})`,
      ...ids
    );
    for (const r of rows) {
      const displayName = (r.displayName && String(r.displayName).trim()) || String(r.username);
      m.set(r.userId, {
        userId: r.userId,
        displayName,
        active: Number(r.isActive) === 1
      });
    }
    return m;
  }

  // Residual #103: assertNoLiveTasksWhenMovingArea removed — UPDATE NOT EXISTS is
  // the atomic area freeze; same-area no-op is handled by existing.areaId compare.

  /**
   * Resolve ownerId to a live AppUser. null/empty clears the assignment.
   * Prefer DB displayName/username so free-form ownerName cannot spoof operators
   * when an ownerId is provided.
   */
  private async resolveActiveOwner(
    ownerId: string | null | undefined
  ): Promise<{ userId: string; displayName: string } | null> {
    if (ownerId == null || String(ownerId).trim() === '') return null;
    const id = String(ownerId).trim().slice(0, 64);
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ userId: string; displayName: string | null; username: string; isActive: number }>
    >(
      `SELECT "userId", "displayName", "username", "isActive" FROM "AppUser" WHERE "userId" = ? LIMIT 1`,
      id
    );
    if (!rows.length) throw new NotFoundException(`负责人用户不存在: ${id}`);
    if (Number(rows[0].isActive) !== 1) {
      throw new BadRequestException(`负责人用户已停用: ${id}`);
    }
    const displayName =
      (rows[0].displayName && String(rows[0].displayName).trim()) || String(rows[0].username);
    return { userId: rows[0].userId, displayName };
  }

  private generateId(): string {
    return newEntityId('grp');
  }
}
